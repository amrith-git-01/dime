import { NO_ACTIVE_ROW, canLiftRow, slotsFromOrder } from "../sortableMath";
import {
  dragWorklet,
  dropWorklet,
  GRIP_BODY,
  GRIP_HANDLE,
  liftWorklet,
} from "../components/sortableWorklets";

jest.mock("react-native-reanimated", () => jest.requireActual("react-native-reanimated/mock"));

const H = 56;
const sv = <T,>(value: T) => ({ value });

function list(count = 4) {
  return {
    count,
    y: Array.from({ length: count }, (_, k) => sv(k * H)),
    startY: Array.from({ length: count }, () => sv(0)),
    lift: Array.from({ length: count }, () => sv(0)),
    owner: Array.from({ length: count }, () => sv(0)),
    slots: sv(slotsFromOrder(["a", "b", "c", "d"].slice(0, count), ["a", "b", "c", "d"].slice(0, count))),
    activeKey: sv(NO_ACTIVE_ROW),
    onSlotChange: jest.fn(),
    onDrop: jest.fn(),
  };
}
type L = ReturnType<typeof list>;

const liftRow = (l: L, k: number, grip = GRIP_BODY) =>
  liftWorklet(k, grip, l.y[k] as never, l.startY[k] as never, l.lift[k] as never, l.activeKey as never, l.owner[k] as never, false);
const dragRow = (l: L, k: number, dy: number, grip = GRIP_BODY) =>
  dragWorklet(k, grip, dy, l.count, l.y[k] as never, l.startY[k] as never, l.slots as never, l.activeKey as never, l.owner[k] as never, l.onSlotChange);
const dropRow = (l: L, k: number, grip = GRIP_BODY) =>
  dropWorklet(k, grip, l.y[k] as never, l.lift[k] as never, l.slots as never, l.activeKey as never, l.owner[k] as never, false, l.onDrop);

describe("canLiftRow", () => {
  it("only while no row is held", () => {
    expect(canLiftRow(NO_ACTIVE_ROW)).toBe(true);
    expect(canLiftRow(0)).toBe(false);
    expect(canLiftRow(3)).toBe(false);
  });
});

describe("sortable drag worklets", () => {
  it("lift, drag and drop move a row and report the new slots once", () => {
    const l = list();
    liftRow(l, 0);
    expect(l.activeKey.value).toBe(0);
    dragRow(l, 0, H * 2);
    expect(l.y[0].value).toBe(H * 2);
    expect(l.slots.value).toEqual([2, 0, 1, 3]);
    expect(l.onSlotChange).toHaveBeenCalledTimes(1);
    dropRow(l, 0);
    expect(l.activeKey.value).toBe(NO_ACTIVE_ROW);
    expect(l.onDrop).toHaveBeenCalledWith([2, 0, 1, 3]);
    expect(l.y[0].value).toBe(H * 2);
  });

  it("a second finger on another row is ignored: it neither lifts nor drags, and its end changes nothing", () => {
    const l = list();
    liftRow(l, 0);
    dragRow(l, 0, H);
    // Second finger lands on row 2.
    liftRow(l, 2);
    expect(l.activeKey.value).toBe(0);
    expect(l.owner[2].value).toBe(0);
    expect(l.lift[2].value).toBe(0);
    dragRow(l, 2, -H * 2);
    expect(l.y[2].value).toBe(2 * H);
    expect(l.slots.value).toEqual([1, 0, 2, 3]);
    // ...and when that finger lifts, the first row is still held.
    dropRow(l, 2);
    expect(l.activeKey.value).toBe(0);
    expect(l.onDrop).not.toHaveBeenCalled();
    // The first finger carries on and drops normally.
    dragRow(l, 0, H * 3);
    dropRow(l, 0);
    expect(l.onDrop).toHaveBeenCalledTimes(1);
    expect(l.onDrop).toHaveBeenCalledWith([3, 0, 1, 2]);
  });

  it("the other grip of the same row cannot take over or end the drag", () => {
    const l = list();
    liftRow(l, 1, GRIP_BODY);
    liftRow(l, 1, GRIP_HANDLE);
    expect(l.owner[1].value).toBe(GRIP_BODY);
    dragRow(l, 1, H, GRIP_HANDLE);
    expect(l.y[1].value).toBe(H);
    dropRow(l, 1, GRIP_HANDLE);
    expect(l.activeKey.value).toBe(1);
    expect(l.onDrop).not.toHaveBeenCalled();
    dropRow(l, 1, GRIP_BODY);
    expect(l.activeKey.value).toBe(NO_ACTIVE_ROW);
  });

  it("a row can be lifted again after the drop", () => {
    const l = list();
    liftRow(l, 0);
    dropRow(l, 0);
    liftRow(l, 3);
    expect(l.activeKey.value).toBe(3);
  });

  it("keeps the dragged row inside the list", () => {
    const l = list();
    liftRow(l, 1);
    dragRow(l, 1, -9999);
    expect(l.y[1].value).toBe(0);
    dragRow(l, 1, 9999);
    expect(l.y[1].value).toBe(3 * H);
    expect(l.slots.value[1]).toBe(3);
  });
});
