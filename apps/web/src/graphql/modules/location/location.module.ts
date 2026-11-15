import { builder } from "../../builder";
import { locationLabel, rankLocations } from "../../../lib/location-match";

const LocationRef = builder.objectRef<{ id: string; city: string; country: string; countryCode: string }>("Location").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    city: t.exposeString("city"),
    country: t.exposeString("country"),
    countryCode: t.exposeString("countryCode"),
    label: t.string({ resolve: (row) => locationLabel(row) }),
  }),
});

// Public: powers the profile location picker. Picking a city also fixes its country.
builder.queryField("locations", (t) =>
  t.field({
    type: [LocationRef],
    args: { query: t.arg.string({ required: true }), first: t.arg.int({ required: false }) },
    resolve: async (_root, args, ctx) => {
      const take = Math.min(Math.max(args.first ?? 8, 1), 30);
      const rows = await ctx.db.location.findMany({ take: 2000 });
      return rankLocations(rows, args.query.slice(0, 60), take);
    },
  }),
);
