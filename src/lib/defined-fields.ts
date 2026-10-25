type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> }

/** Returns a copy of the object without the keys whose value is `undefined`, for use as a partial patch. */
export function definedFields<T extends object>(fields: T): Defined<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Defined<T>
}
