import { isTablePointer, isTableRendererId } from '@haven/schema';
import type { TableEditRequest, TableEditResult } from './table-edits.js';
import { InvalidTableResponse, snapshotTableJson } from './table-response.js';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const scalar = (value: unknown) =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value));
export function isTableEditRequest(value: unknown): value is TableEditRequest {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !['transactionId', 'rowKey', 'changes'].includes(key)) ||
    typeof value['transactionId'] !== 'string' ||
    !value['transactionId'] ||
    value['transactionId'].length > 128 ||
    !(
      (typeof value['rowKey'] === 'string' &&
        value['rowKey'].length > 0 &&
        value['rowKey'].length <= 4096) ||
      (typeof value['rowKey'] === 'number' && Number.isFinite(value['rowKey']))
    ) ||
    !Array.isArray(value['changes']) ||
    !value['changes'].length ||
    value['changes'].length > 100
  )
    return false;
  return value['changes'].every((entry: unknown) => {
    if (
      !object(entry) ||
      Object.keys(entry).some((key) => !['columnId', 'path', 'before', 'value'].includes(key)) ||
      !isTableRendererId(entry['columnId']) ||
      !isTablePointer(entry['path']) ||
      !scalar(entry['value'])
    )
      return false;
    const before = entry['before'];
    return (
      object(before) &&
      (before['exists'] === false
        ? Object.keys(before).length === 1
        : before['exists'] === true && Object.keys(before).length === 2 && scalar(before['value']))
    );
  });
}
export function isTableEditResult(value: unknown): value is TableEditResult {
  if (!object(value)) return false;
  switch (value['status']) {
    case 'applied':
      return Object.keys(value).length === 2 && object(value['row']);
    case 'conflict':
      return Object.keys(value).length === 1;
    case 'error':
      return Object.keys(value).length === 2 && isTableRendererId(value['code']);
    case 'invalid':
      return (
        Object.keys(value).length === 2 &&
        Array.isArray(value['errors']) &&
        value['errors'].length <= 100 &&
        value['errors'].every(
          (error: unknown) =>
            object(error) &&
            Object.keys(error).length === 2 &&
            isTablePointer(error['path']) &&
            isTableRendererId(error['code']),
        )
      );
    default:
      return false;
  }
}
/** Remote and local handlers cross the same bounded, immutable JSON result boundary. */
export function copyTableEditResult(value: unknown): TableEditResult {
  const copy = snapshotTableJson(value);
  if (!isTableEditResult(copy)) throw new InvalidTableResponse();
  return copy;
}
/** Requests cross a host boundary as immutable snapshots; never share the live form or row. */
export function snapshotTableEdit(request: TableEditRequest): TableEditRequest {
  const copy = structuredClone(request);
  const freeze = (value: unknown): void => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(copy);
  return copy;
}
