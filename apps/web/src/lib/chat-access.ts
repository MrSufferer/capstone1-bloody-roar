export interface ChatIssueState {
  clientId: string;
  developerId: string | null;
  status: string;
}

export interface ChatActor {
  id: string;
  role: string;
}

// Chat stays open through a dispute; after the task ends it becomes read-only history.
const READABLE_WORK_STATES = new Set(["AWAITING_FUNDING", "IN_PROGRESS", "DISPUTED", "COMPLETED", "CANCELLED"]);
const WRITABLE_WORK_STATES = new Set(["AWAITING_FUNDING", "IN_PROGRESS", "DISPUTED"]);

export function canReadIssueChat(issue: ChatIssueState, actor: ChatActor): boolean {
  if (actor.role === "ADMIN") return issue.status === "DISPUTED";
  if (!issue.developerId || !READABLE_WORK_STATES.has(issue.status)) return false;
  return issue.clientId === actor.id || issue.developerId === actor.id;
}

export function canWriteIssueChat(issue: ChatIssueState, actor: ChatActor): boolean {
  if (actor.role === "ADMIN" || !WRITABLE_WORK_STATES.has(issue.status) || !issue.developerId) return false;
  return issue.clientId === actor.id || issue.developerId === actor.id;
}

type ConversationState = { kind: string; participants?: Array<{ userId: string; role: string }> };
function workIssue(conv: ConversationState, issue: ChatIssueState): ChatIssueState {
  return issue.status === "AWAITING_FUNDING" && !issue.developerId ? { ...issue, developerId: conv.participants?.find((p) => p.role === "DEVELOPER")?.userId ?? null } : issue;
}
type ApplicationState = { status: string; developerId: string };
export function canReadConversation(conv: ConversationState, issue: ChatIssueState, application: ApplicationState | null, actor: ChatActor, isParticipant: boolean): boolean {
  if (conv.kind === "ISSUE_WORK") return (isParticipant || actor.role === "ADMIN") && canReadIssueChat(workIssue(conv, issue), actor);
  return conv.kind === "APPLICATION" && isParticipant && Boolean(application && (issue.clientId === actor.id || application.developerId === actor.id));
}
export function canWriteConversation(conv: ConversationState, issue: ChatIssueState, application: ApplicationState | null, actor: ChatActor, isParticipant: boolean): boolean {
  if (actor.role === "ADMIN" || !canReadConversation(conv, issue, application, actor, isParticipant)) return false;
  return conv.kind === "ISSUE_WORK" ? canWriteIssueChat(workIssue(conv, issue), actor) : issue.status === "OPEN" && application?.status === "PENDING";
}
