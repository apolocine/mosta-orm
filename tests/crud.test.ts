// Suite CRUD paramétrée — rejoue le scénario de validation (création, lecture, count,
// filtres, update, upsert, delete, relations, pagination) sur CHAQUE dialecte in-process.
// Aucune infra : sqlite / sql.js / pglite / duckdb, tout en mémoire.
// Author: Dr Hamid MADANI <drmdh@msn.com>
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { IN_PROCESS_DIALECTS, setupRepos, type TestRepos } from './helpers.js';

describe.each(IN_PROCESS_DIALECTS)('CRUD — $label', (cfg) => {
  let repos: TestRepos;
  const id: Record<string, string> = {};

  beforeAll(async () => {
    repos = await setupRepos(cfg);
  });

  afterAll(async () => {
    await repos?.dialect.disconnect();
  });

  it('schéma vide : count() = 0', async () => {
    expect(await repos.cat.count()).toBe(0);
    expect(await repos.prod.count()).toBe(0);
    expect(await repos.order.count()).toBe(0);
  });

  it('create — catégories ×2', async () => {
    const c1 = await repos.cat.create({ name: 'Electronique', description: 'Appareils', order: 1 });
    const c2 = await repos.cat.create({ name: 'Vetements', description: 'Mode', order: 2 });
    expect(c1.id).toBeTruthy();
    expect(c2.id).toBeTruthy();
    id.cat1 = c1.id as string;
    id.cat2 = c2.id as string;
  });

  it('create — produits ×3 avec relation many-to-one', async () => {
    const p1 = await repos.prod.create({ name: 'Laptop Pro', slug: 'laptop-pro', price: 120000, stock: 15, status: 'active', category: id.cat1, tags: ['laptop', 'pro'], metadata: { brand: 'MostaTech', year: 2025 } });
    const p2 = await repos.prod.create({ name: 'T-Shirt', slug: 'tshirt', price: 2500, stock: 100, status: 'active', category: id.cat2, tags: ['coton'] });
    const p3 = await repos.prod.create({ name: 'Ecouteurs', slug: 'ecouteurs', price: 5000, stock: 0, status: 'draft', category: id.cat1 });
    expect([p1.id, p2.id, p3.id].every(Boolean)).toBe(true);
    id.prod1 = p1.id as string;
    id.prod3 = p3.id as string;
  });

  it('create — commandes ×2 avec relation required', async () => {
    const o1 = await repos.order.create({ orderNumber: 'CMD-001', total: 120000, status: 'paid', product: id.prod1 });
    const o2 = await repos.order.create({ orderNumber: 'CMD-002', total: 5000, status: 'pending', product: id.prod1 });
    expect([o1.id, o2.id].every(Boolean)).toBe(true);
  });

  it('findById — retrouve par id', async () => {
    const cat = await repos.cat.findById(id.cat1);
    expect(cat).not.toBeNull();
    expect((cat as Record<string, unknown>).name).toBe('Electronique');
  });

  it('findOne — filtre sur champ unique', async () => {
    const prod = await repos.prod.findOne({ slug: 'laptop-pro' });
    expect(prod).not.toBeNull();
    expect((prod as Record<string, unknown>).price).toBe(120000);
  });

  it('findAll — récupère tout', async () => {
    expect((await repos.prod.findAll()).length).toBe(3);
  });

  it('count() — total exact (régression casse alias cnt/CNT)', async () => {
    expect(await repos.cat.count()).toBe(2);
    expect(await repos.prod.count()).toBe(3);
    expect(await repos.order.count()).toBe(2);
  });

  it('count(filter) — comptage filtré', async () => {
    expect(await repos.prod.count({ status: 'active' })).toBe(2);
    expect(await repos.prod.count({ status: 'draft' })).toBe(1);
  });

  it('findAll(filter) — lecture filtrée', async () => {
    const active = await repos.prod.findAll({ status: 'active' });
    expect(active.length).toBe(2);
  });

  it('update — modifie prix/stock/statut', async () => {
    await repos.prod.update(id.prod3, { price: 4500, stock: 25, status: 'active' });
    const u = await repos.prod.findById(id.prod3) as Record<string, unknown>;
    expect(u.price).toBe(4500);
    expect(u.stock).toBe(25);
    expect(u.status).toBe('active');
  });

  it('upsert — crée si absent puis met à jour', async () => {
    const created = await repos.cat.upsert({ name: 'Sport' }, { name: 'Sport', description: 'Articles', order: 3 });
    expect(created.id).toBeTruthy();
    expect(await repos.cat.count()).toBe(3);
    const updated = await repos.cat.upsert({ name: 'Sport' }, { name: 'Sport', description: 'Sport & fitness', order: 3 });
    expect(updated.id).toBe(created.id);
    expect((await repos.cat.findById(created.id as string) as Record<string, unknown>).description).toBe('Sport & fitness');
    expect(await repos.cat.count()).toBe(3); // pas de doublon
  });

  it('pagination — limit/skip/sort cohérents', async () => {
    const page1 = await repos.prod.findAll({}, { sort: { price: 'asc' }, limit: 2, skip: 0 });
    const page2 = await repos.prod.findAll({}, { sort: { price: 'asc' }, limit: 2, skip: 2 });
    expect(page1.length).toBe(2);
    expect(page2.length).toBe(1);
    const prices = page1.map((p) => (p as Record<string, number>).price);
    expect(prices[0]).toBeLessThanOrEqual(prices[1]);
  });

  it('delete — supprime une ligne', async () => {
    const ok = await repos.prod.delete(id.prod3);
    expect(ok).toBe(true);
    expect(await repos.prod.findById(id.prod3)).toBeNull();
    expect(await repos.prod.count()).toBe(2);
  });

  it('deleteMany — vide les collections', async () => {
    await repos.order.deleteMany({});
    await repos.prod.deleteMany({});
    await repos.cat.deleteMany({});
    expect(await repos.order.count()).toBe(0);
    expect(await repos.prod.count()).toBe(0);
    expect(await repos.cat.count()).toBe(0);
  });
});
