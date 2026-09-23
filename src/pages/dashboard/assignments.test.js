import {
  normalizeAssignment,
  normalizeClassroom,
  getAssignmentDueInfo,
  filterAndSortTodoAssignments,
} from './shared';

describe('Assignments and Section Isolation', () => {
  const classrooms = [
    {
      id: 'class-1',
      teacher_id: 'teacher-1',
      classroom_name: 'Biology 101',
      section: 'Section Alpha',
      subject: 'Science',
      classroom_code: 'BIO101A',
    },
    {
      id: 'class-2',
      teacher_id: 'teacher-1',
      classroom_name: 'Chemistry 101',
      section: 'Section Beta',
      subject: 'Science',
      classroom_code: 'CHM101B',
    },
  ];

  const normalizedClassrooms = classrooms.map((c, i) => normalizeClassroom(c, i));
  const classroomsById = new Map(normalizedClassrooms.map((c) => [c.id, c]));

  test('normalizes assignments with classroom name, section, and subject', () => {
    const rawAssignment = {
      id: 'assign-1',
      classroom_id: 'class-1',
      teacher_id: 'teacher-1',
      title: 'Lab Report 1',
      instructions: 'Write a detailed report',
      due_date: '2026-10-01T23:59:59.000Z',
      created_at: '2026-09-01T10:00:00.000Z',
    };

    const normalized = normalizeAssignment(rawAssignment, classroomsById, { submissions: 3 });

    expect(normalized.title).toBe('Lab Report 1');
    expect(normalized.classroomId).toBe('class-1');
    expect(normalized.classroomName).toBe('Biology 101');
    expect(normalized.classroomSection).toBe('Section Alpha');
    expect(normalized.classroomSubject).toBe('Science');
    expect(normalized.classroomCode).toBe('BIO101A');
    expect(normalized.submissions).toBe(3);
  });

  test('isolates students and submissions to assignment classroom section', () => {
    const selectedAssignment = {
      id: 'assign-1',
      classroomId: 'class-1',
      title: 'Lab Report 1',
      classroomName: 'Biology 101',
      classroomSection: 'Section Alpha',
      dueDate: '2026-10-01T23:59:59.000Z',
    };

    // Members across different sections
    const classroomMembers = [
      { id: 'm1', classroomId: 'class-1', studentId: 's1', studentName: 'Alice Alpha', studentEmail: 'alice@test.com' },
      { id: 'm2', classroomId: 'class-1', studentId: 's2', studentName: 'Bob Alpha', studentEmail: 'bob@test.com' },
      { id: 'm3', classroomId: 'class-2', studentId: 's3', studentName: 'Charlie Beta', studentEmail: 'charlie@test.com' },
    ];

    // Submissions across different sections and assignments
    const submissions = [
      {
        id: 'sub-1',
        assignmentId: 'assign-1',
        classroomId: 'class-1',
        studentId: 's1',
        studentName: 'Alice Alpha',
        essayTitle: 'My Biology Lab',
        fileUrl: 'https://example.com/essay1.pdf',
        grade: '95',
        feedback: 'Great job!',
        createdAt: '2026-09-15T12:00:00.000Z',
      },
      // Submission belonging to class-2 (should NEVER appear in class-1 roster)
      {
        id: 'sub-2',
        assignmentId: 'assign-2',
        classroomId: 'class-2',
        studentId: 's3',
        studentName: 'Charlie Beta',
        essayTitle: 'Chemistry Essay',
        fileUrl: 'https://example.com/essay2.pdf',
        grade: '88',
        feedback: 'Good',
        createdAt: '2026-09-16T12:00:00.000Z',
      },
    ];

    // Simulate roster computation logic
    const enrolledMembers = classroomMembers.filter(
      (m) => m.classroomId === selectedAssignment.classroomId
    );

    const assignmentSubmissions = submissions.filter(
      (s) =>
        s.assignmentId === selectedAssignment.id &&
        s.classroomId === selectedAssignment.classroomId
    );

    const submissionByStudentId = new Map(
      assignmentSubmissions.map((s) => [s.studentId, s])
    );

    const roster = enrolledMembers.map((member) => {
      const sub = submissionByStudentId.get(member.studentId);
      const isSubmitted = Boolean(sub);
      const isGraded = Boolean(sub?.grade);

      return {
        studentId: member.studentId,
        studentName: member.studentName,
        studentEmail: member.studentEmail,
        submission: sub || null,
        isSubmitted,
        status: isGraded ? 'graded' : isSubmitted ? 'submitted' : 'missing',
        fileUrl: sub?.fileUrl || null,
        grade: sub?.grade || '',
        feedback: sub?.feedback || '',
      };
    });

    // Verify results
    expect(roster).toHaveLength(2); // Only Alice and Bob from Section Alpha
    expect(roster.map((r) => r.studentName)).toEqual(['Alice Alpha', 'Bob Alpha']);
    expect(roster.some((r) => r.studentName === 'Charlie Beta')).toBe(false);

    // Alice submitted and is graded
    const alice = roster.find((r) => r.studentName === 'Alice Alpha');
    expect(alice.isSubmitted).toBe(true);
    expect(alice.status).toBe('graded');
    expect(alice.grade).toBe('95');
    expect(alice.fileUrl).toBe('https://example.com/essay1.pdf');

    // Bob has not submitted and is marked missing
    const bob = roster.find((r) => r.studentName === 'Bob Alpha');
    expect(bob.isSubmitted).toBe(false);
    expect(bob.status).toBe('missing');
    expect(bob.grade).toBe('');
    expect(bob.fileUrl).toBeNull();
  });
});

describe('Student To Do and Due Soon Feature', () => {
  const refDate = new Date('2026-09-20T12:00:00.000Z');

  test('getAssignmentDueInfo correctly classifies overdue, due soon, upcoming, and submitted', () => {
    // 1. Overdue: due yesterday
    const overdue = getAssignmentDueInfo('2026-09-19T12:00:00.000Z', false, refDate);
    expect(overdue.isOverdue).toBe(true);
    expect(overdue.isDueSoon).toBe(false);
    expect(overdue.status).toBe('overdue');
    expect(overdue.label).toBe('Overdue');

    // 2. Due soon: due tomorrow
    const dueSoon = getAssignmentDueInfo('2026-09-21T12:00:00.000Z', false, refDate);
    expect(dueSoon.isOverdue).toBe(false);
    expect(dueSoon.isDueSoon).toBe(true);
    expect(dueSoon.status).toBe('due_soon');
    expect(dueSoon.relativeText).toBe('Due tomorrow');

    // 3. Upcoming (> 7 days): due in 10 days
    const upcoming = getAssignmentDueInfo('2026-09-30T12:00:00.000Z', false, refDate);
    expect(upcoming.isOverdue).toBe(false);
    expect(upcoming.isDueSoon).toBe(false);
    expect(upcoming.status).toBe('upcoming');

    // 4. No due date
    const noDue = getAssignmentDueInfo(null, false, refDate);
    expect(noDue.status).toBe('no_due_date');
    expect(noDue.isOverdue).toBe(false);

    // 5. Submitted assignment
    const submitted = getAssignmentDueInfo('2026-09-19T12:00:00.000Z', true, refDate);
    expect(submitted.status).toBe('submitted');
    expect(submitted.isOverdue).toBe(false);
    expect(submitted.label).toBe('Turned in');
  });

  test('filterAndSortTodoAssignments separates todo, due soon, and completed, sorting due soon by nearest date', () => {
    const assignments = [
      {
        id: 'a1',
        title: 'Essay 1 - Due Next Month',
        classroomId: 'c1',
        dueDate: '2026-10-25T12:00:00.000Z',
        submitted: false,
      },
      {
        id: 'a2',
        title: 'Quiz - Due Tomorrow',
        classroomId: 'c1',
        dueDate: '2026-09-21T12:00:00.000Z',
        submitted: false,
      },
      {
        id: 'a3',
        title: 'Project - Due in 3 days',
        classroomId: 'c2',
        dueDate: '2026-09-23T12:00:00.000Z',
        submitted: false,
      },
      {
        id: 'a4',
        title: 'Homework - Overdue',
        classroomId: 'c1',
        dueDate: '2026-09-18T12:00:00.000Z',
        submitted: false,
      },
      {
        id: 'a5',
        title: 'Lab Report - Completed',
        classroomId: 'c1',
        dueDate: '2026-09-19T12:00:00.000Z',
        submitted: true,
      },
    ];

    const result = filterAndSortTodoAssignments(assignments, '', refDate);

    // a5 is submitted, so it must be removed from todo and placed in completed
    expect(result.todoList.map((a) => a.id)).not.toContain('a5');
    expect(result.dueSoonList.map((a) => a.id)).not.toContain('a5');
    expect(result.completedList.map((a) => a.id)).toContain('a5');

    // Due soon list must be sorted by nearest due date first: Quiz (Sep 21) then Project (Sep 23) then Essay 1 (Oct 25)
    expect(result.dueSoonList[0].id).toBe('a2');
    expect(result.dueSoonList[1].id).toBe('a3');
    expect(result.dueSoonList[2].id).toBe('a1');

    // a4 is overdue
    expect(result.overdueList.map((a) => a.id)).toContain('a4');
    const overdueItem = result.todoList.find((a) => a.id === 'a4');
    expect(overdueItem.dueInfo.isOverdue).toBe(true);

    // Classroom isolation: filter by 'c1' should not show 'c2' assignments
    const c1Result = filterAndSortTodoAssignments(assignments, 'c1', refDate);
    expect(c1Result.todoList.map((a) => a.id)).not.toContain('a3');
    expect(c1Result.dueSoonList.map((a) => a.id)).not.toContain('a3');
  });
});

