// Bản giả (mock) của npm:@supabase/supabase-js@2 dùng khi chạy test.
// Mỗi câu truy vấn được ghi lại vào `calls`, và kết quả trả về do `resolver` quyết định.

export type QueryCall = {
  table: string
  op: 'select' | 'insert' | 'update'
  columns?: string
  options?: Record<string, unknown>
  payload?: unknown
  filters: Array<[string, string, unknown]>
  terminal: 'single' | 'maybeSingle' | 'await'
}

// deno-lint-ignore no-explicit-any
export type QueryResult = { data?: any; error?: any; count?: number | null }

export const mock = {
  user: { id: 'user-1' } as { id: string } | null,
  calls: [] as QueryCall[],
  resolver: (_call: QueryCall): QueryResult => ({ data: null, error: null }),
  reset() {
    this.user = { id: 'user-1' }
    this.calls = []
    this.resolver = () => ({ data: null, error: null })
  },
}

const run = (call: QueryCall) => {
  mock.calls.push(call)
  const r = mock.resolver(call)
  return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null })
}

const builder = (table: string) => {
  const call: QueryCall = { table, op: 'select', filters: [], terminal: 'await' }
  const b = {
    select(columns?: string, options?: Record<string, unknown>) {
      // select() sau insert/update chỉ để lấy dữ liệu trả về, không đổi op
      if (call.op === 'select') {
        call.columns = columns
        call.options = options
      }
      return b
    },
    insert(payload: unknown) {
      call.op = 'insert'
      call.payload = payload
      return b
    },
    update(payload: unknown) {
      call.op = 'update'
      call.payload = payload
      return b
    },
    eq(col: string, val: unknown) {
      call.filters.push(['eq', col, val])
      return b
    },
    is(col: string, val: unknown) {
      call.filters.push(['is', col, val])
      return b
    },
    single() {
      call.terminal = 'single'
      return run(call)
    },
    maybeSingle() {
      call.terminal = 'maybeSingle'
      return run(call)
    },
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return run(call).then(resolve, reject)
    },
  }
  return b
}

export const createClient = (_url: string, _key: string, _opts?: unknown) => ({
  auth: {
    getUser: () =>
      Promise.resolve(
        mock.user === null
          ? { data: { user: null }, error: { message: 'invalid token' } }
          : { data: { user: mock.user }, error: null },
      ),
  },
  from: (table: string) => builder(table),
})
