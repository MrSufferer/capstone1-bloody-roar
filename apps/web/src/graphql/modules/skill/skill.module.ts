import { builder } from "../../builder";
import { rankSkills } from "../../../lib/skill-match";

const SkillRef = builder.objectRef<{ id: string; name: string; category: string }>("Skill").implement({
  fields: (t) => ({ id: t.exposeID("id"), name: t.exposeString("name"), category: t.exposeString("category") }),
});

// Public: powers the skill pickers. A typed query is ranked by alias, prefix, word start and small typos;
// an empty query returns the skills most used by open bounties, then the rest alphabetically.
builder.queryField("skills", (t) =>
  t.field({
    type: [SkillRef],
    args: { query: t.arg.string({ required: false }), first: t.arg.int({ required: false }) },
    resolve: async (_root, args, ctx) => {
      const q = (args.query ?? "").trim().slice(0, 40);
      const take = Math.min(Math.max(args.first ?? 8, 1), 50);
      const rows = await ctx.db.skill.findMany({ orderBy: { name: "asc" }, take: 1000 });
      if (q) return rankSkills(rows, q, take);
      const used = await ctx.db.$queryRaw<Array<{ skill: string; uses: bigint }>>`
        SELECT skill, count(*) AS uses FROM issues, unnest("requiredSkills") AS skill
        WHERE "isDraft" = false GROUP BY skill ORDER BY uses DESC LIMIT 50
      `;
      const rank = new Map(used.map((row, index) => [row.skill.toLowerCase(), index]));
      return [...rows].sort((a, b) => (rank.get(a.name.toLowerCase()) ?? 1e9) - (rank.get(b.name.toLowerCase()) ?? 1e9)).slice(0, take);
    },
  }),
);
