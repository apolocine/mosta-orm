// Schémas d'entités de test — autonomes, zéro dépendance externe.
// Repris du harnais de validation live (test-sgbd) pour cohérence des scénarios.
// Author: Dr Hamid MADANI <drmdh@msn.com>
import type { EntitySchema } from '../../src/index.js';

export const CategorySchema = {
  name: 'Category',
  collection: 'test_categories',
  timestamps: true,
  fields: {
    name: { type: 'string', required: true, unique: true },
    description: { type: 'string', default: '' },
    order: { type: 'number', default: 0 },
    active: { type: 'boolean', default: true },
  },
  relations: {},
  indexes: [{ fields: { order: 'asc' } }],
} satisfies EntitySchema;

export const ProductSchema = {
  name: 'Product',
  collection: 'test_products',
  timestamps: true,
  fields: {
    name: { type: 'string', required: true },
    slug: { type: 'string', required: true, unique: true },
    price: { type: 'number', required: true },
    stock: { type: 'number', default: 0 },
    status: { type: 'string', enum: ['active', 'archived', 'draft'], default: 'draft' },
    tags: { type: 'array', arrayOf: 'string' },
    metadata: { type: 'json' },
  },
  relations: {
    category: { target: 'Category', type: 'many-to-one' },
  },
  indexes: [{ fields: { status: 'asc', price: 'desc' } }],
} satisfies EntitySchema;

export const OrderSchema = {
  name: 'Order',
  collection: 'test_orders',
  timestamps: true,
  fields: {
    orderNumber: { type: 'string', required: true, unique: true },
    total: { type: 'number', required: true },
    status: { type: 'string', enum: ['pending', 'paid', 'shipped', 'cancelled'], default: 'pending' },
    notes: { type: 'string' },
    orderDate: { type: 'date', default: 'now' },
  },
  relations: {
    product: { target: 'Product', type: 'many-to-one', required: true },
  },
  indexes: [{ fields: { status: 'asc' } }],
} satisfies EntitySchema;

export const ALL_SCHEMAS = [CategorySchema, ProductSchema, OrderSchema];
