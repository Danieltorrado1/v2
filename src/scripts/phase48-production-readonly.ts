// Legacy global contract revoked before credentials, health or transport.
console.error(JSON.stringify({status:"STOPPED",reason:"LEGACY_PHASE48_CONTRACT_REVOKED_USE_SCOPED_V2",productive_writes:0}));
process.exitCode=1;
