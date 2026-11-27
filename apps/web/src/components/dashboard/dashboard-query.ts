import { queryOptions } from "@tanstack/react-query";
import { graphqlRequest } from "@/lib/graphql-client";

const DASHBOARD_QUERY = `query Dashboard {
  userStats { postedTasks workingTasks completedTasks applications completedPayouts }
  myIssues { id title status category bountyAmount { formatted } updatedAt developerId clientId token { symbol } }
  myApplications { id status createdAt issue { id title bountyAmount { formatted } token { symbol } client { name } } }
}`;

type DashboardResponse = {
  userStats: { postedTasks: number; workingTasks: number; completedTasks: number; applications: number; completedPayouts: number };
  myIssues: Array<{
    id: string; title: string; status: string; category: string; bountyAmount: { formatted: string };
    updatedAt: string; developerId?: string | null; clientId: string; token: { symbol: string };
  }>;
  myApplications: Array<{
    id: string; status: string; createdAt: string;
    issue: { id: string; title: string; bountyAmount: { formatted: string }; token: { symbol: string }; client: { name?: string | null } };
  }>;
};

export const dashboardQueryOptions = (userId: string | undefined) => queryOptions({
  queryKey: ["dashboard", userId],
  enabled: Boolean(userId),
  staleTime: 15_000,
  retry: false,
  queryFn: ({ signal }) => graphqlRequest<DashboardResponse>(DASHBOARD_QUERY, {}, signal),
  select: (result) => ({
    userStats: result.userStats,
    myIssues: result.myIssues.map((task) => ({ ...task, bountyAmount: Number(task.bountyAmount.formatted) })),
    myApplications: result.myApplications.map((application) => ({ ...application, issue: { ...application.issue, bountyAmount: Number(application.issue.bountyAmount.formatted) } })),
  }),
});
