export * from './extraction/index'
export * from './gs1/index'
export * from './judge/index'
export * from './geometry/index'
export * from './ghs/index'
export * from './layout/index'
export * from './render/index'
export * from './rules/index'
export * from './symbology/index'
export * from './templates/index'
export * from './text/index'
export * from './fda/index'
export * from './types/index'

// `./schema` is deliberately absent. It builds its zod schemas when it loads, so
// re-exporting it here would put zod and every schema into the web bundle, which
// validates nothing with them. Import it as `@packwright/label-core/schema`.
