export const name = 'niubash-local-invariant'
export const inject = ['invariants']
export const apply = (ctx) => Promise.resolve(ctx.invariants.register('@cmx666/dsh-niubash-local', () => {}))
