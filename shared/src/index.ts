/**
 * @techbuilder/contracts — FROZEN Contracts Pack (Prompt 0).
 * Single source of truth for enums, types, OrgConfig, API contract, adapter interfaces, RBAC.
 * DB schema is exported separately at "@techbuilder/contracts/db/schema".
 * Backend + frontend import from here. Do NOT redefine any of these elsewhere.
 */
export * from './common';
export * from './enums';
export * from './errors';
export * from './config';
export * from './domain';
export * from './dto';
export * from './api';
export * from './adapters';
export * from './permissions';
