import type { FieldValidation } from './field-validators.js';
/** JSON-only public contracts. No framework or server dependencies. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type DataType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
export interface DataSchema {
  type?: DataType;
  $ref?: string;
  $defs?: Record<string, DataSchema>;
  properties?: Record<string, DataSchema>;
  required?: string[];
  items?: DataSchema;
  enum?: JsonPrimitive[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  format?: 'email' | 'date' | 'time' | 'date-time';
}
export type ValueRef = { literal: JsonValue } | { path: string; scope?: 'root' | 'item' | 'event' };
export type Condition =
  | { op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'; left: ValueRef; right: ValueRef }
  | { op: 'exists'; value: ValueRef }
  | { op: 'and' | 'or'; conditions: Condition[] }
  | { op: 'not'; condition: Condition };
export interface UiNode {
  id: string;
  kind: string;
  version: number;
  props?: JsonObject;
  bind?: string;
  children?: UiNode[];
  validators?: FieldValidation[];
  rules?: { visible?: Condition; disabled?: Condition; required?: Condition };
  events?: Record<string, string[]>;
}
export interface HavenTheme {
  preset: 'material' | 'liquid-glass';
  mode: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  tokens?: Record<string, string>;
}
export interface ActionBinding {
  handler: string;
  input?: Record<string, ValueRef>;
}
export interface ResourceBinding {
  adapter: string;
  type: 'query' | 'options' | 'upload' | 'validation' | 'tree';
}
export interface HavenDocument {
  schemaVersion: '1.0';
  id: string;
  title: string;
  dataSchema: DataSchema;
  ui: UiNode;
  theme: HavenTheme;
  actions: Record<string, ActionBinding>;
  resources: Record<string, ResourceBinding>;
}
export interface Diagnostic {
  code: string;
  path: string;
  message: string;
  nodeId?: string;
}
export interface ValidationResult {
  structural: boolean;
  valid: boolean;
  diagnostics: Diagnostic[];
  capabilities: string[];
}
export interface PropertyDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  label: string;
  localizable?: boolean;
  enum?: readonly JsonPrimitive[];
  minimum?: number;
  maximum?: number;
}
export interface ComponentManifest {
  kind: string;
  version: number;
  title: string;
  container: boolean;
  binding: 'none' | 'optional' | 'required';
  dataTypes: readonly DataType[];
  events: readonly string[];
  properties: Readonly<Record<string, PropertyDefinition>>;
}
export interface ValidationLimits {
  maxBytes: number;
  maxNodes: number;
  maxDepth: number;
  maxRuleNodes: number;
}
