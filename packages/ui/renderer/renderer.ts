import { FieldContentStore } from './field-content';
import type { FieldContentState } from './field-content';
import { validationPlan } from './validation-plan';
import { submitRendererForm } from './form-submit';
import type { RendererSubmitOptions } from './form-submit';
import { TreeResourceState } from './tree-resource/state';
import { OptionResolutionStore } from './option-resolution';
import { NodeFeedbackStore } from './node-feedback';
import { PendingEditStore } from './pending-edits';
import { injectRendererForm } from './renderer-form';
import type { HavenOptionResolution } from '@haven/ui/form';
import type { OptionsAdapter, UploadAdapter } from '@haven/runtime';
import { RendererActionDispatcher } from './action-dispatcher';
import type { HavenActionOutcome, HavenActionTrace } from './action-dispatcher';
import { HAVEN_RENDERER_HOST } from './host';
import type { HavenRendererHost } from './host';
import { validateRendererDocument } from './capabilities';
import { HavenRenderNode } from './render-node';
import { HavenLocalization } from '@haven/ui';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { readPointer } from '@haven/schema';
import { RenderInstanceBuilder } from './instances';
import { buildFieldPolicy } from './field-policy';
import type { NodeState } from './field-policy';
export type { NodeState } from './field-policy';
import type {
  Condition,
  HavenDocument,
  JsonObject,
  JsonValue,
  UiNode,
  TableRowKey,
  ValidationLimits,
} from '@haven/schema';
import { compileCondition } from '@haven/runtime';
import { HavenThemeDirective } from '@haven/ui/theme';
import type { FieldPolicy } from '@haven/ui/form-state';

export interface HavenUiEvent {
  nodeId: string;
  instanceId?: string;
  event: string;
  value?: JsonValue;
}

/** The same renderer is used in the modeller preview and the published display route. */
@Component({
  selector: 'haven-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HavenRenderNode, HavenThemeDirective],
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .themed-content {
      color: var(--mat-sys-on-surface);
      font-family: var(--mat-sys-body-large-font);
    }
  `,
  template: `
    <div class="themed-content" [havenTheme]="document().theme">
      @if (instances().exceeded) {
        <p role="alert">{{ localization.message('renderer.limit') }}</p>
      } @else if (validation().valid && fields()) {
        @for (scope of documentScopes(); track scope.key) {
          <haven-render-node [node]="instances().root" [renderer]="this" />
        }
      } @else {
        <ul role="alert">
          @for (error of validation().diagnostics; track $index) {
            <li>
              {{ error.nodeId ?? error.path }}: {{ localization.diagnostic(error) }} ({{
                error.code
              }})
            </li>
          }
        </ul>
      }
    </div>
    @if (actionDispatcher.failure(); as failure) {
      <p role="alert">
        {{ localization.message('action.failure') }} ({{
          failure.result.status === 'error' ? failure.result.code : ''
        }})
      </p>
    }
  `,
})
export class HavenRenderer {
  readonly localization = inject(HavenLocalization);
  readonly document = input.required<HavenDocument>();
  readonly value = model<JsonObject>({});
  readonly host = input<HavenRendererHost>(inject(HAVEN_RENDERER_HOST));
  /** Trusted embedding budget; JSON documents cannot change validation or renderer capabilities. */
  readonly validationLimits = input<Partial<ValidationLimits>>({});
  // Native controls and their requests belong to one document revision. Cosmetic edits
  // within that identity preserve component instances, input and interaction state.
  readonly documentIdentity = computed(() =>
    JSON.stringify([this.document().id, this.host().revision ?? null]),
  );
  readonly documentScopes = computed(() => [{ key: this.documentIdentity() }]);
  readonly actionResult = output<HavenActionOutcome>();
  readonly actionTrace = output<HavenActionTrace>();
  readonly actionDispatcher = new RendererActionDispatcher();
  readonly #actionOwner = computed(
    () => ({
      id: this.document().id,
      actions: this.host().actions,
      revision: this.host().revision,
    }),
    { equal: (a, b) => a.id === b.id && a.actions === b.actions && a.revision === b.revision },
  );
  dispatch(
    node: UiNode,
    event: string,
    value?: JsonValue,
    selection: readonly TableRowKey[] = [],
    actionScope?: { ids: readonly string[]; key: string; active?: () => boolean },
  ): void {
    const state = this.states().get(node.id);
    if (!state?.visible || state.disabled || !this.validation().valid) return;
    // Signals may attach private array-item identities. External events own JSON snapshots.
    const context = this.instances().contexts.get(node.id);
    const sourceId = context?.source.id ?? node.id;
    const identity = context?.repeated ? { instanceId: node.id } : {};
    const eventValue = value === undefined ? undefined : structuredClone(value);
    this.uiEvent.emit({
      nodeId: sourceId,
      ...identity,
      event,
      ...(eventValue === undefined ? {} : { value: structuredClone(eventValue) }),
    });
    const document = this.document(),
      owner = this.#actionOwner();
    const ids = actionScope?.ids ?? node.events?.[event] ?? [];
    if (!ids.length) return;
    const selectedKeys = [...selection];
    // Let Signal Forms consume the same native output before snapshotting root field values.
    queueMicrotask(() => {
      if (
        this.#destroy.destroyed ||
        this.#actionOwner() !== owner ||
        !this.validation().valid ||
        !this.states().has(node.id) ||
        actionScope?.active?.() === false
      )
        return;
      void this.actionDispatcher.dispatch({
        host: this.host(),
        bindings: document.actions,
        ids,
        event,
        ...(actionScope ? { scope: actionScope.key } : {}),
        context: {
          documentId: document.id,
          revision: this.host().revision ?? 'draft',
          nodeId: sourceId,
          ...identity,
          ...(context?.repeated
            ? {
                item: readPointer(
                  this.value(),
                  this.instances().contexts.get(node.id)!.scope,
                ) as JsonValue,
              }
            : {}),
          data: this.value(),
          selection: selectedKeys,
          event: { type: event, ...(eventValue === undefined ? {} : { value: eventValue }) },
        },
        result: (outcome) => this.actionResult.emit(outcome),
        trace: (entry) => this.actionTrace.emit(entry),
      });
    });
  }
  readonly uiEvent = output<HavenUiEvent>();
  readonly #optionResolutions = new OptionResolutionStore();
  readonly treeResources = new TreeResourceState(this);
  optionAdapter(node: UiNode): OptionsAdapter | undefined {
    const id = node.props?.['resource'];
    const binding = typeof id === 'string' ? this.document().resources[id] : undefined;
    return binding?.type === 'options' ? this.host().options?.get(binding.adapter) : undefined;
  }
  optionIdentity(node: UiNode): string {
    const resource = node.props?.['resource'];
    return JSON.stringify([
      this.fieldIdentity(node),
      node.kind,
      resource,
      typeof resource === 'string' ? this.document().resources[resource] : null,
    ]);
  }
  uploadAdapter(node: UiNode, property = 'resource'): UploadAdapter | undefined {
    const id = node.props?.[property];
    const binding = typeof id === 'string' ? this.document().resources[id] : undefined;
    return binding?.type === 'upload' ? this.host().uploads?.get(binding.adapter) : undefined;
  }
  resolveOptions(id: string, adapter: OptionsAdapter, state: HavenOptionResolution): void {
    const current = this.states().get(id)?.node;
    if (
      !current ||
      state.identity !== this.optionIdentity(current) ||
      adapter !== this.optionAdapter(current) ||
      state.adapter !== adapter ||
      state.locale !== this.localization.locale()
    )
      return;
    this.#optionResolutions.set(JSON.stringify([state.identity, state.locale]), id, adapter, state);
  }
  readonly fieldContent = new FieldContentStore();
  readonly #pendingEdits = new PendingEditStore((id, identity, kind) => {
    if (this.#destroy.destroyed || !this.validation().valid) return false;
    const state = this.states().get(id);
    return (
      !!state?.visible &&
      !state.disabled &&
      !state.readonly &&
      state.node.kind === kind &&
      this.fieldIdentity(state.node) === identity
    );
  });
  readonly pendingEdits = this.#pendingEdits.pending;
  registerPendingEdit(id: string, identity: string, liveRead: () => boolean): () => void {
    if (this.#destroy.destroyed || !this.validation().valid) return () => {};
    const state = this.states().get(id);
    if (!state || this.fieldIdentity(state.node) !== identity) return () => {};
    return this.#pendingEdits.register(id, identity, state.node.kind, liveRead);
  }
  readonly #feedback = new NodeFeedbackStore(
    this.documentIdentity,
    (id) => !!this.states().get(id)?.visible && !this.states().get(id)?.disabled,
  );
  fieldIdentity(node: UiNode): string {
    return JSON.stringify([
      this.documentIdentity(),
      node.id,
      this.instances().contexts.get(node.id)?.source.bind,
    ]);
  }
  setFieldContent(id: string, state: FieldContentState): void {
    const node = this.states().get(id)?.node;
    if (node && state.identity === this.fieldIdentity(node)) this.fieldContent.set(id, state);
  }
  setAssetIncomplete(id: string, invalid: boolean): void {
    this.#feedback.setAssetIncomplete(id, invalid);
  }
  readonly uploading = this.#feedback.uploading;
  setUploading(id: string, active: boolean): void {
    this.#feedback.setUploading(id, active);
  }
  forgetNode(id: string): void {
    this.actionDispatcher.forget(id);
    this.#feedback.forget(id);
    this.#optionResolutions.remove(id);
    this.treeResources.remove(id);
    this.fieldContent.remove(id);
  }
  setParseError(id: string, invalid: boolean): void {
    this.#feedback.setParseError(id, invalid);
  }
  readonly validation = computed(() =>
    validateRendererDocument(this.document(), { limits: this.validationLimits() }),
  );
  readonly #form = injectRendererForm({
    document: () => this.document(),
    value: this.value,
    identity: this.documentIdentity,
    structure: () => this.#structure(),
    structural: () => this.#structural(),
    ready: () => this.validation().valid && !this.pendingEdits(),
    plan: () => this.#validationPlan(),
    states: () => this.states(),
    sourceId: (id) => this.instances().contexts.get(id)?.source.id ?? id,
    policy: (pointer) => this.policy(pointer),
    validator: (resource) => {
      const binding = this.document().resources[resource];
      return binding?.type === 'validation'
        ? this.host().validators?.get(binding.adapter)
        : undefined;
    },
  });
  readonly fields = this.#form.fields;
  readonly #instanceBuilder = new RenderInstanceBuilder();
  readonly instances = computed(() =>
    this.#instanceBuilder.build(
      this.document().ui,
      this.value(),
      this.fields(),
      this.host().maxRenderedNodes,
    ),
  );
  readonly #destroy = inject(DestroyRef);
  readonly #structural = computed(() => this.validation().structural);
  readonly #validationPlan = computed(() =>
    this.validation().valid ? validationPlan(this.document().ui) : { fields: [], repeats: [] },
  );
  readonly #structure = computed(() =>
    JSON.stringify([this.document().dataSchema, this.#validationPlan()]),
  );
  readonly #rules = new WeakMap<Condition, ReturnType<typeof compileCondition>>();
  readonly states = computed(() => {
    const states = new Map<string, NodeState>();
    const data = this.value();
    const evaluate = (condition: Condition | undefined, fallback: boolean, item?: JsonValue) => {
      if (!condition) return fallback;
      let rule = this.#rules.get(condition);
      if (!rule) {
        rule = compileCondition(condition);
        this.#rules.set(condition, rule);
      }
      return rule.evaluate({ root: data, ...(item === undefined ? {} : { item }) });
    };
    const visit = (node: UiNode, parent?: NodeState) => {
      const scope = this.instances().contexts.get(node.id);
      const item = scope?.repeated ? (readPointer(data, scope.scope) as JsonValue) : undefined;
      const state: NodeState = {
        node,
        visible: (parent?.visible ?? true) && evaluate(node.rules?.visible, true, item),
        disabled: (parent?.disabled ?? false) || evaluate(node.rules?.disabled, false, item),
        readonly: (parent?.readonly ?? false) || node.props?.['readonly'] === true,
        required: evaluate(node.rules?.required, false, item),
      };
      states.set(node.id, state);
      for (const child of node.children ?? []) visit(child, state);
    };
    visit(this.instances().root);
    return states;
  });
  constructor() {
    this.#destroy.onDestroy(() => this.actionDispatcher.reset());
    this.#destroy.onDestroy(() => this.#pendingEdits.clear());
    effect(() => {
      this.#actionOwner();
      this.actionDispatcher.reset();
    });
  }
  readonly #byBinding = computed(() => {
    const result = new Map<string, NodeState[]>();
    for (const state of this.states().values()) {
      // Display bindings read data but must not participate in editable field policies.
      if (
        state.node.bind === undefined ||
        !(state.node.kind.startsWith('field.') || state.node.kind === 'form.repeat')
      )
        continue;
      const group = result.get(state.node.bind) ?? [];
      group.push(state);
      result.set(state.node.bind, group);
    }
    return result;
  });
  /** A strict native submission attempt; pending does not queue an automatic future save. */
  submit(options: RendererSubmitOptions): Promise<boolean> {
    return submitRendererForm(options, {
      fields: this.fields,
      identity: this.documentIdentity,
      valid: () => this.validation().valid && this.#form.current() && !this.pendingEdits(),
      destroyed: () => this.#destroy.destroyed,
    });
  }
  readonly pending = computed(() => this.fields()?.().pending() ?? false);
  readonly submitting = computed(() => this.fields()?.().submitting() ?? false);
  policy(pointer: string): FieldPolicy {
    const states = this.#byBinding().get(pointer) ?? [];
    const policy = buildFieldPolicy(states, {
      assetIncomplete: (id) => this.#feedback.assetIncomplete(id),
      content: (node) =>
        this.fieldContent.get(
          node.id,
          this.fieldIdentity(node),
          node.bind === undefined ? undefined : readPointer(this.value(), node.bind),
        ),
      uploading: (id) => this.#feedback.uploadPending(id),
      parseInvalid: (id) => this.#feedback.parseInvalid(id),
      repeatInvalid: (id) => this.instances().invalidRepeats.has(id),
      treeOptions: (node) => this.treeResources.get(node),
      options: (node) =>
        this.#optionResolutions.get(
          JSON.stringify([this.optionIdentity(node), this.localization.locale()]),
          node.id,
          this.optionAdapter(node),
        ),
    });
    return { ...policy, renderLimit: pointer === '' && this.instances().exceeded };
  }
}
