import { describe, expect, it } from "vitest";
import { removeMeetingScheduleAttendee, toggleMeetingScheduleAttendee } from "./community-schedule-attendance";

describe("community schedule attendance", () => {
  it("removes only the current user when they cancel attendance", () => {
    expect(toggleMeetingScheduleAttendee(["host-1", "member-42", "user-001"], "member-42", 4))
      .toEqual(["host-1", "user-001"]);
  });

  it("adds the current user without changing other attendees when a seat is available", () => {
    expect(toggleMeetingScheduleAttendee(["host-1", "member-7"], "member-42", 3))
      .toEqual(["host-1", "member-7", "member-42"]);
  });

  it("does not add an attendee when the schedule is full", () => {
    const attendees = ["host-1", "member-7"];
    expect(toggleMeetingScheduleAttendee(attendees, "member-42", 2)).toBe(attendees);
  });

  it("removes the departing member from every schedule without changing other attendees", () => {
    const schedules = [
      { id: "a", attendeeIds: ["host-1", "member-42"] },
      { id: "b", attendeeIds: ["member-7", "member-42"] },
    ];
    expect(removeMeetingScheduleAttendee(schedules, "member-42")).toEqual([
      { id: "a", attendeeIds: ["host-1"] },
      { id: "b", attendeeIds: ["member-7"] },
    ]);
    expect(schedules[0].attendeeIds).toEqual(["host-1", "member-42"]);
  });

  it("returns the original schedule collection when the member has no RSVP", () => {
    const schedules = [{ id: "a", attendeeIds: ["host-1"] }];
    expect(removeMeetingScheduleAttendee(schedules, "member-42")).toBe(schedules);
  });
});
