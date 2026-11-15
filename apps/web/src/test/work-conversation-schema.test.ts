import { expect, it } from "vitest";
import { schema } from "../graphql/schema";

it("opens work conversations through a mutation", () => {
  expect(schema.getQueryType()?.getFields().workConversation).toBeUndefined();
  expect(schema.getMutationType()?.getFields().workConversation?.resolve).toBeTypeOf("function");
});
