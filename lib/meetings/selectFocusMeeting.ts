type MeetingForSelection = {
  status: string;
  scheduled_start: string;
};

export function selectFocusMeeting<T extends MeetingForSelection>(meetings: T[]) {
  const inProgress = meetings.find((meeting) => meeting.status === "in_progress");
  if (inProgress) return inProgress;

  const preparationMeetings = meetings.filter((meeting) => meeting.status === "draft" || meeting.status === "identity_open");
  const now = Date.now();
  const upcoming = preparationMeetings
    .filter((meeting) => new Date(meeting.scheduled_start).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime())[0];
  if (upcoming) return upcoming;

  const latestPreparation = preparationMeetings
    .sort((a, b) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime())[0];
  if (latestPreparation) return latestPreparation;

  return meetings
    .filter((meeting) => meeting.status === "closed" || meeting.status === "archived")
    .sort((a, b) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime())[0]
    ?? null;
}
