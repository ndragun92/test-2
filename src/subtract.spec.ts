import subtract from './subtract'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
test('subtracts two numbers', () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
  expect(subtract(10, 7)).toBe(3)
})
