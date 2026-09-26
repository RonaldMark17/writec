import { render } from "@testing-library/react";
import { normalizeClassroom, ArchiveIcon, UnarchiveIcon } from "./shared";

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

  test("normalizeClassroom respects isArchived passed in extra", () => {
    const row = {
      id: "cls-3",
      classroom_name: "Biology 101",
      classroom_code: "BIO101",
    };

    const normalized = normalizeClassroom(row, 0, { isArchived: true });
    expect(normalized.isArchived).toBe(true);
  });

  test("ArchiveIcon and UnarchiveIcon render svg elements", () => {
    const { container: archiveContainer } = render(<ArchiveIcon className="test-archive" />);
    expect(archiveContainer.querySelector("svg")).toBeInTheDocument();

    const { container: unarchiveContainer } = render(<UnarchiveIcon className="test-unarchive" />);
    expect(unarchiveContainer.querySelector("svg")).toBeInTheDocument();
  });
});
