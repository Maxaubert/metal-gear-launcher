export type Action =
  | "up"
  | "down"
  | "left"
  | "right"
  | "confirm"
  | "back"
  | "prevGame"
  | "nextGame"
  | "menu";

export type Screen = "hub" | "selection" | "firstRun" | "notInstalled";

export type NavState = {
  screen: Screen;
  game: number;
  item: number;
  menuLength: number;
  gameCount: number;
};

const wrap = (n: number, len: number) => ((n % len) + len) % len;

export function navigate(s: NavState, a: Action): NavState {
  if (s.screen === "selection") {
    const cols = 3;
    switch (a) {
      case "left":
        return { ...s, item: wrap(s.item - 1, s.gameCount) };
      case "right":
        return { ...s, item: wrap(s.item + 1, s.gameCount) };
      case "up":
        return { ...s, item: wrap(s.item - cols, s.gameCount) };
      case "down":
        return { ...s, item: wrap(s.item + cols, s.gameCount) };
      case "confirm":
        return { ...s, screen: "hub", game: s.item, item: 0 };
      case "back":
      case "menu":
        return { ...s, screen: "hub", item: 0 };
      default:
        return s;
    }
  }
  switch (a) {
    case "up":
      return { ...s, item: wrap(s.item - 1, s.menuLength) };
    case "down":
      return { ...s, item: wrap(s.item + 1, s.menuLength) };
    case "left":
    case "prevGame":
      return { ...s, game: wrap(s.game - 1, s.gameCount), item: 0 };
    case "right":
    case "nextGame":
      return { ...s, game: wrap(s.game + 1, s.gameCount), item: 0 };
    case "menu":
      return { ...s, screen: "selection", item: s.game };
    default:
      return s; // confirm and back are handled by the screen (start game, quit prompt)
  }
}
