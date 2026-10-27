/**
 * How a placement reads in a menu.
 *
 * The stored values keep the engine's spelling ("centre", "bottom-centre"),
 * because saved labels carry them and the schema validates them. Only the words
 * shown to the user change, so a label saved before this still opens.
 */
export const anchorName = (anchor: string): string => anchor.replace('centre', 'center')
