import { render } from "@testing-library/react";
import { normalizeClassroom, ArchiveIcon, UnarchiveIcon, LeaveIcon, isCustomAvatarUrl } from "./shared";

describe("classroom archive normalization and icons", () => {
  test("normalizeClassroom correctly marks classroom as archived when is_archived is true", () => {
    const row = {
      id: "cls-1",
      classroom_name: "Physics 101",
      classroom_code: "PHY101",
      section: "Sec 1",
      subject: "Science",
      teacher_name: "Dr. Smith",
      teacher_id: "t-1",
      is_archived: true,
    };

    const normalized = normalizeClassroom(row, 0);
    expect(normalized.isArchived).toBe(true);
    expect(normalized.name).toBe("Physics 101");
  });

  test("normalizeClassroom defaults isArchived to false when is_archived is omitted or false", () => {
    const row = {
      id: "cls-2",
      classroom_name: "Chemistry 101",
      classroom_code: "CHM101",
      section: "Sec 2",
      subject: "Science",
      teacher_name: "Dr. Curie",
      teacher_id: "t-2",
    };

    const normalized = normalizeClassroom(row, 0);
    expect(normalized.isArchived).toBe(false);

    const normalizedExplicitFalse = normalizeClassroom({ ...row, is_archived: false }, 0);
    expect(normalizedExplicitFalse.isArchived).toBe(false);
  });

  test("normalizeClassroom respects isArchived passed in extra even when row.is_archived is false", () => {
    const row = {
      id: "cls-3",
      classroom_name: "Biology 101",
      classroom_code: "BIO101",
      is_archived: false,
    };

    // Even if row.is_archived is false from DB, extra.isArchived must be respected
    const normalized = normalizeClassroom(row, 0, { isArchived: true });
    expect(normalized.isArchived).toBe(true);

    const normalizedFalse = normalizeClassroom({ ...row, is_archived: true }, 0, { isArchived: false });
    expect(normalizedFalse.isArchived).toBe(false);
  });

  test("resolves isArchived properly on reload using cache when database returns false", () => {
    const cachedArchivedSet = new Set(["cls-cached"]);

    const rowFromDb = {
      id: "cls-cached",
      classroom_name: "Art History",
      is_archived: false,
    };

    const isArchived = Boolean(
      rowFromDb.is_archived === true || cachedArchivedSet.has(String(rowFromDb.id))
    );

    const normalized = normalizeClassroom(rowFromDb, 0, { isArchived });
    expect(normalized.isArchived).toBe(true);
  });

  test("ArchiveIcon, UnarchiveIcon, and LeaveIcon render svg elements", () => {
    const { container: archiveContainer } = render(<ArchiveIcon className="test-archive" />);
    expect(archiveContainer.querySelector("svg")).toBeInTheDocument();

    const { container: unarchiveContainer } = render(<UnarchiveIcon className="test-unarchive" />);
    expect(unarchiveContainer.querySelector("svg")).toBeInTheDocument();

    const { container: leaveContainer } = render(<LeaveIcon className="test-leave" />);
    expect(leaveContainer.querySelector("svg")).toBeInTheDocument();
  });

  test("isCustomAvatarUrl correctly detects placeholder silhouettes", () => {
    expect(isCustomAvatarUrl("https://lh3.googleusercontent.com/a/default-user=s96-c")).toBe(false);
    expect(isCustomAvatarUrl("https://example.com/images/default-avatar.png")).toBe(false);
    expect(isCustomAvatarUrl("https://example.com/silhouette.jpg")).toBe(false);
    expect(isCustomAvatarUrl("")).toBe(false);
    expect(isCustomAvatarUrl(null)).toBe(false);
    expect(isCustomAvatarUrl("data:image/jpeg;base64,12345")).toBe(true);
    expect(isCustomAvatarUrl("https://lh3.googleusercontent.com/a/ACg8ocLrealphoto=s96-c")).toBe(true);
  });

  test("student leaving classroom filters classroom list correctly", () => {
    const initialClassrooms = [
      { id: "c1", name: "Math" },
      { id: "c2", name: "Science" },
      { id: "c3", name: "History" },
    ];
    const leftClassroomId = "c2";
    const remainingClassrooms = initialClassrooms.filter(
      (c) => String(c.id) !== String(leftClassroomId)
    );
    expect(remainingClassrooms).toHaveLength(2);
    expect(remainingClassrooms.map((c) => c.id)).toEqual(["c1", "c3"]);
  });
});
