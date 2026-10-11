import { keepPreviousDataForUser } from "../keepPreviousDataForUser";

const previousQuery = (userId: string) => ({
  queryKey: ["insights", "month", userId, 2026, 10, "Asia/Kolkata"],
});

describe("keepPreviousDataForUser", () => {
  it("keeps previous data when the previous key belongs to the same user", () => {
    const placeholder = keepPreviousDataForUser("user-a");
    expect(placeholder({ total: 1 }, previousQuery("user-a"))).toEqual({
      total: 1,
    });
  });

  it("drops previous data that belongs to another user", () => {
    const placeholder = keepPreviousDataForUser("user-b");
    expect(placeholder({ total: 1 }, previousQuery("user-a"))).toBeUndefined();
  });

  it("drops previous data when signed out or without a previous query", () => {
    expect(
      keepPreviousDataForUser(undefined)({ total: 1 }, previousQuery("user-a")),
    ).toBeUndefined();
    expect(
      keepPreviousDataForUser("user-a")({ total: 1 }, undefined),
    ).toBeUndefined();
  });
});
