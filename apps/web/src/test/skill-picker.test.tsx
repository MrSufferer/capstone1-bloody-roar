import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SkillPicker } from "@/components/ui/skill-picker";

vi.mock("@/lib/graphql-client", () => ({ graphqlRequest: vi.fn(async () => ({ skills: [{ name: "React" }, { name: "React Native" }] })) }));

function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return <><SkillPicker value={value} onChange={setValue} max={5} /><output data-testid="out">{value.join("|")}</output></>;
}

describe("SkillPicker", () => {
  it("Tab picks the highlighted suggestion and keeps focus in the field", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Add a skill");
    input.focus();
    fireEvent.change(input, { target: { value: "rea" } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "Tab" });
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("React"));
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("lets Tab leave when nothing is typed", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Add a skill");
    const notPrevented = fireEvent.keyDown(input, { key: "Tab" });
    expect(notPrevented).toBe(true);
  });
});
