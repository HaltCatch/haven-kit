import { Injectable } from '@angular/core';
import { TableCellSnapshotCache } from './cell-snapshot-cache.mjs';

/** A separate cache belongs to each table component's Angular injector. */
@Injectable()
export class HavenTableCellSnapshots extends TableCellSnapshotCache {}
