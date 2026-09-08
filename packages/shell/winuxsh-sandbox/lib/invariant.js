export const name = 'winuxsh-sandbox-invariant'
export const inject = ['invariants']
export const apply = (ctx) => Promise.resolve(ctx.invariants.register('@cmx666/dsh-winuxsh-sandbox', () => {}))
