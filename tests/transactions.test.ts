// Transactions ACID — commit (persiste) et rollback (annule) via $transaction(cb),
// sur chaque dialecte in-process supportant les transactions.
// Author: Dr Hamid MADANI <drmdh@msn.com>
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseRepository } from '../src/index.js';
import { IN_PROCESS_DIALECTS, setupRepos, type TestRepos } from './helpers.js';
import { CategorySchema } from './fixtures/schemas.js';

describe.each(IN_PROCESS_DIALECTS)('Transactions — $label', (cfg) => {
  let repos: TestRepos;

  beforeAll(async () => {
    repos = await setupRepos(cfg);
  });

  afterAll(async () => {
    await repos?.dialect.disconnect();
  });

  it('commit — les écritures du callback persistent', async () => {
    const before = await repos.cat.count();
    await repos.dialect.$transaction(async (tx) => {
      const catTx = new BaseRepository(CategorySchema, tx);
      await catTx.create({ name: 'Tx-Commit', order: 10 });
    });
    expect(await repos.cat.count()).toBe(before + 1);
    expect(await repos.cat.findOne({ name: 'Tx-Commit' })).not.toBeNull();
  });

  it('rollback — une exception annule toutes les écritures', async () => {
    const before = await repos.cat.count();
    await expect(
      repos.dialect.$transaction(async (tx) => {
        const catTx = new BaseRepository(CategorySchema, tx);
        await catTx.create({ name: 'Tx-Rollback', order: 11 });
        throw new Error('boom — déclenche le rollback');
      }),
    ).rejects.toThrow('boom');
    expect(await repos.cat.count()).toBe(before);
    expect(await repos.cat.findOne({ name: 'Tx-Rollback' })).toBeNull();
  });
});
