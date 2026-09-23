export type IntegracionFlagState = {
  outbox: boolean;
  sync: boolean;
  recalc: boolean;
  recalc_reason: 'ACTIVE' | 'DISABLED' | 'DEPENDENCIES_REQUIRED';
  sync_reason: 'ACTIVE' | 'DISABLED' | 'DEPENDENCIES_REQUIRED';
};

export const resolveIntegracionFlagState = (flags: { outbox: boolean; sync: boolean; recalc: boolean }): IntegracionFlagState => ({
  outbox: flags.outbox,
  sync: flags.outbox && flags.sync,
  recalc: flags.outbox && flags.sync && flags.recalc,
  sync_reason: flags.sync && !flags.outbox ? 'DEPENDENCIES_REQUIRED' : flags.sync ? 'ACTIVE' : 'DISABLED',
  recalc_reason: flags.recalc && (!flags.outbox || !flags.sync) ? 'DEPENDENCIES_REQUIRED' : flags.recalc ? 'ACTIVE' : 'DISABLED'
});
