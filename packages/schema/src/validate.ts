import { guardDocumentJson } from './validation/document-guard.js';
import { isTableRowActions } from './table-editing.js';
import { validateFieldBindings } from './field-validator-bindings.js';
import { validateComponent } from './validate-components.js';
import { isChoiceOptions } from './options.js';
import { isLocalizedText } from './localization.js';
import validateStructure from './generated/validate.js';
import { createManifestRegistry } from './catalog.js';
import { escapePointer, pointerSegments, resolveSchema, schemaAtPointer } from './pointer.js';
import type {
  ComponentManifest,
  Condition,
  DataSchema,
  Diagnostic,
  HavenDocument,
  UiNode,
  ValidationLimits,
  ValidationResult,
  ValueRef,
} from './types.js';
export const defaultLimits: Readonly<ValidationLimits> = Object.freeze({
  maxBytes: 1_048_576,
  maxNodes: 2000,
  maxDepth: 48,
  maxRuleNodes: 5000,
});
export interface ValidationOptions {
  limits?: Partial<ValidationLimits>;
  manifests?: ReadonlyMap<string, ComponentManifest>;
  supportedCapabilities?: readonly string[];
}
export function validateDocument(
  value: unknown,
  options: ValidationOptions = {},
): ValidationResult {
  const limits = { ...defaultLimits, ...options.limits };
  const guarded = guardDocumentJson(value, limits);
  if (!guarded.ok)
    return { structural: false, valid: false, diagnostics: [guarded.diagnostic], capabilities: [] };
  const candidate: unknown = guarded.value;
  if (!validateStructure(candidate))
    return {
      structural: false,
      valid: false,
      capabilities: [],
      diagnostics: (validateStructure.errors ?? []).slice(0, 100).map((error) => ({
        code: `structure.${error.keyword}`,
        path: error.instancePath,
        message: error.message ?? 'Invalid document',
      })),
    };
  const doc = candidate as unknown as HavenDocument;
  const diagnostics: Diagnostic[] = [];
  const capabilities = new Set<string>();
  const ids = new Set<string>();
  const registry = options.manifests ?? createManifestRegistry();
  const add = (code: string, path: string, message: string, nodeId?: string) => {
    diagnostics.push({ code, path, message, ...(nodeId === undefined ? {} : { nodeId }) });
  };
  const activeSchemas = new Set<DataSchema>();
  const checkedSchemas = new Set<DataSchema>();
  function checkSchema(schema: DataSchema, path: string) {
    if (activeSchemas.has(schema)) {
      add('data.reference', path, 'Recursive data schemas are not supported');
      return;
    }
    if (checkedSchemas.has(schema)) return;
    activeSchemas.add(schema);
    checkSchemaInner(schema, path);
    activeSchemas.delete(schema);
    checkedSchemas.add(schema);
  }
  function checkSchemaInner(schema: DataSchema, path: string) {
    const resolved = resolveSchema(schema, doc.dataSchema);
    if (!resolved) {
      add('data.reference', path, 'Missing or cyclic schema reference');
      return;
    }
    if (schema.$ref) {
      if (Object.keys(schema).some((key) => key !== '$ref'))
        add('data.refSiblings', path, 'Reference does not accept sibling constraints');
      checkSchema(resolved, path);
      return;
    }
    const allowed: Record<string, readonly string[]> = {
      object: ['properties', 'required'],
      array: ['items', 'minItems', 'maxItems'],
      string: ['minLength', 'maxLength', 'format', 'enum'],
      number: ['minimum', 'maximum', 'enum'],
      boolean: ['enum'],
      null: ['enum'],
    };
    for (const key of Object.keys(schema))
      if (!['type', '$defs'].includes(key) && !allowed[schema.type!]?.includes(key))
        add('data.keyword', `${path}/${key}`, 'Constraint does not apply to this type');
    for (const [min, max] of [
      ['minLength', 'maxLength'],
      ['minimum', 'maximum'],
      ['minItems', 'maxItems'],
    ] as const)
      if (schema[min] !== undefined && schema[max] !== undefined && schema[min]! > schema[max]!)
        add('data.range', path, 'Minimum exceeds maximum');
    for (const key of schema.required ?? [])
      if (!Object.hasOwn(schema.properties ?? {}, key))
        add('data.required', `${path}/required`, `Unknown required property: ${key}`);
    for (const entry of schema.enum ?? [])
      if ((entry === null ? 'null' : typeof entry) !== schema.type)
        add('data.enum', `${path}/enum`, 'Enum value has incompatible type');
    if (schema.type === 'array' && !schema.items)
      add('data.items', path, 'Array requires items schema');
    for (const [key, child] of Object.entries(schema.properties ?? {}))
      checkSchema(child, `${path}/properties/${escapePointer(key)}`);
    if (schema.items) checkSchema(schema.items, `${path}/items`);
    for (const [key, child] of Object.entries(schema.$defs ?? {}))
      checkSchema(child, `${path}/$defs/${escapePointer(key)}`);
  }
  checkSchema(doc.dataSchema, '/dataSchema');
  if (resolveSchema(doc.dataSchema, doc.dataSchema)?.type !== 'object')
    add('data.root', '/dataSchema', 'Root data must be an object');
  let ruleCount = 0;
  function checkRef(
    ref: ValueRef,
    scope: DataSchema,
    path: string,
    nodeId: string,
    allowEvent = false,
  ) {
    if (!('path' in ref)) return;
    try {
      pointerSegments(ref.path);
      if (ref.scope === 'event' && !allowEvent)
        add('rule.scope', path, 'Event scope is only available during an event action', nodeId);
      if (
        ref.scope !== 'event' &&
        !schemaAtPointer(ref.scope === 'item' ? scope : doc.dataSchema, ref.path, doc.dataSchema)
      )
        add('rule.path', path, 'Rule references an unknown data path', nodeId);
    } catch {
      add('rule.path', path, 'Rule path is invalid', nodeId);
    }
  }
  function checkCondition(condition: Condition, scope: DataSchema, path: string, nodeId: string) {
    if (++ruleCount > limits.maxRuleNodes) return;
    if ('left' in condition) {
      checkRef(condition.left, scope, `${path}/left`, nodeId);
      checkRef(condition.right, scope, `${path}/right`, nodeId);
    }
    if ('value' in condition) checkRef(condition.value, scope, `${path}/value`, nodeId);
    if ('conditions' in condition)
      condition.conditions.forEach((child, index) =>
        checkCondition(child, scope, `${path}/conditions/${index}`, nodeId),
      );
    if ('condition' in condition)
      checkCondition(condition.condition, scope, `${path}/condition`, nodeId);
  }
  let count = 0;
  function visit(node: UiNode, path: string, scope: DataSchema, repeated = false) {
    if (++count > limits.maxNodes) return;
    if (ids.has(node.id)) add('node.duplicate', `${path}/id`, 'Node ID must be unique', node.id);
    ids.add(node.id);
    const capability = `${node.kind}@${node.version}`;
    capabilities.add(capability);
    const manifest = registry.get(capability);
    if (!manifest)
      add('component.unknown', `${path}/kind`, `Unknown component: ${capability}`, node.id);
    if (options.supportedCapabilities && !options.supportedCapabilities.includes(capability))
      add(
        'component.unsupported',
        `${path}/kind`,
        'Consumer does not implement this component',
        node.id,
      );
    if (manifest) {
      if (node.children?.length && !manifest.container)
        add('node.children', `${path}/children`, 'Component does not accept children', node.id);
      if (manifest.binding === 'required' && node.bind === undefined)
        add('binding.required', path, 'Component requires a data binding', node.id);
      if (manifest.binding === 'none' && node.bind !== undefined)
        add(
          'binding.forbidden',
          `${path}/bind`,
          'Component does not accept a data binding',
          node.id,
        );
      for (const [key, value] of Object.entries(node.props ?? {})) {
        const prop = Object.hasOwn(manifest.properties, key) ? manifest.properties[key] : undefined;
        if (!prop)
          add(
            'property.unknown',
            `${path}/props/${escapePointer(key)}`,
            'Unknown component property',
            node.id,
          );
        else if (
          value === null ||
          ((Array.isArray(value) ? 'array' : typeof value) !== prop.type &&
            !(prop.type === 'string' && prop.localizable && isLocalizedText(value))) ||
          (prop.enum && !prop.enum.some((item) => item === value)) ||
          (typeof value === 'number' &&
            ((prop.minimum !== undefined && value < prop.minimum) ||
              (prop.maximum !== undefined && value > prop.maximum)))
        )
          add(
            'property.value',
            `${path}/props/${escapePointer(key)}`,
            'Invalid component property value',
            node.id,
          );
      }
      for (const [event, actions] of Object.entries(node.events ?? {})) {
        if (!manifest.events.includes(event))
          add(
            'event.unknown',
            `${path}/events/${escapePointer(event)}`,
            'Unsupported component event',
            node.id,
          );
        for (const id of actions) {
          const action = Object.hasOwn(doc.actions, id) ? doc.actions[id] : undefined;
          if (!action)
            add(
              'action.missing',
              `${path}/events/${escapePointer(event)}`,
              `Unknown action: ${id}`,
              node.id,
            );
          else
            for (const [key, ref] of Object.entries(action.input ?? {}))
              checkRef(
                ref,
                scope,
                `/actions/${escapePointer(id)}/input/${escapePointer(key)}`,
                node.id,
                true,
              );
        }
      }
    }
    let bound: DataSchema | undefined;
    if (node.bind !== undefined) {
      try {
        bound = schemaAtPointer(scope, node.bind, doc.dataSchema);
      } catch {
        /* Report a stable binding error below. */
      }
      if (!bound)
        add('binding.path', `${path}/bind`, 'Binding does not resolve to a field', node.id);
      else if (manifest && !manifest.dataTypes.includes(bound.type!))
        add('binding.type', `${path}/bind`, 'Component is incompatible with field type', node.id);
    }
    diagnostics.push(...validateFieldBindings(node, doc, scope, repeated, bound, path));
    const choiceOptions = node.props?.['options'];
    if (
      ['field.select', 'field.multiselect', 'field.radio'].includes(node.kind) &&
      choiceOptions !== undefined
    ) {
      if (!isChoiceOptions(choiceOptions))
        add('options.invalid', `${path}/props/options`, 'Invalid or duplicate options', node.id);
      else if (bound) {
        const type =
          node.kind === 'field.multiselect'
            ? bound.items && resolveSchema(bound.items, doc.dataSchema)?.type
            : bound.type;
        if (choiceOptions.some((option) => typeof option.value !== type))
          add(
            'options.type',
            `${path}/props/options`,
            'Option value is incompatible with the field type',
            node.id,
          );
      }
    }
    diagnostics.push(...validateComponent(node, bound, doc.dataSchema, path));
    if (node.kind === 'table' && isTableRowActions(node.props?.['rowActions']))
      for (const action of node.props['rowActions'])
        for (const id of action.actions)
          if (!Object.hasOwn(doc.actions, id))
            add(
              'action.reference',
              `${path}/props/rowActions`,
              'Unknown table row action binding',
              node.id,
            );
    const resource = node.props?.['resource'];
    if (typeof resource === 'string') {
      const binding = Object.hasOwn(doc.resources, resource) ? doc.resources[resource] : undefined;
      const expected =
        node.kind === 'table'
          ? 'query'
          : ['field.file', 'field.files', 'field.image'].includes(node.kind)
            ? 'upload'
            : ['tree', 'field.tree-select', 'field.tree-multiselect', 'field.cascader'].includes(
                  node.kind,
                )
              ? 'tree'
              : 'options';
      if (!binding || binding.type !== expected)
        add('resource.type', `${path}/props/resource`, `Expected a ${expected} resource`, node.id);
    }
    if (node.kind === 'field.rich-text' && typeof node.props?.['upload'] === 'string') {
      const id = node.props['upload'];
      const binding = Object.hasOwn(doc.resources, id) ? doc.resources[id] : undefined;
      if (!binding || binding.type !== 'upload')
        add('resource.type', `${path}/props/upload`, 'Expected an upload resource', node.id);
    }
    for (const [effect, condition] of Object.entries(node.rules ?? {}))
      checkCondition(condition, scope, `${path}/rules/${effect}`, node.id);
    const childScope = node.kind === 'form.repeat' ? bound?.items : scope;
    node.children?.forEach((child, index) =>
      visit(
        child,
        `${path}/children/${index}`,
        childScope ?? scope,
        repeated || node.kind === 'form.repeat',
      ),
    );
  }
  visit(doc.ui, '/ui', doc.dataSchema);
  if (count > limits.maxNodes) add('limit.nodes', '/ui', 'Too many UI nodes');
  if (ruleCount > limits.maxRuleNodes) add('limit.rules', '/ui', 'Too many rule nodes');
  const themeTokens = new Set([
    'primary',
    'surface',
    'onSurface',
    'error',
    'glassTint',
    'glassBlur',
    'glassBorder',
    'glassRadius',
    'glassSaturation',
    'fontFamily',
    'fontSize',
    'radius',
    'spacing',
  ]);
  for (const [key, value] of Object.entries(doc.theme.tokens ?? {})) {
    if (!themeTokens.has(key) || /[;{}<>]|url\s*\(/i.test(value))
      add('theme.token', `/theme/tokens/${escapePointer(key)}`, 'Unsupported theme token or value');
  }
  return {
    structural: true,
    valid: diagnostics.length === 0,
    diagnostics,
    capabilities: [...capabilities].sort(),
  };
}
export function isHavenDocument(value: unknown): value is HavenDocument {
  return validateDocument(value).valid;
}
