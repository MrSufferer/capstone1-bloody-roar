import { describe, expect, it } from "vitest";
import { locationLabel, rankLocations, type LocationRow } from "../lib/location-match";

const row = (city: string, country: string, countryCode: string): LocationRow => ({ id: `${countryCode}${city}`, city, country, countryCode });
const rows = [row("Ho Chi Minh City", "Vietnam", "VN"), row("Hanoi", "Vietnam", "VN"), row("São Paulo", "Brazil", "BR"), row("Paris", "France", "FR"), row("Paris", "United States", "US"), row("Singapore", "Singapore", "SG")];
const labels = (query: string) => rankLocations(rows, query, 5).map(locationLabel);

describe("rankLocations", () => {
  it("maps a city to its country", () => expect(labels("hanoi")).toEqual(["Hanoi, Vietnam"]));
  it("ignores accents and case", () => expect(labels("SAO paulo")).toEqual(["São Paulo, Brazil"]));
  it("lists a country's cities when the country is typed", () => expect(labels("vietnam")).toEqual(["Hanoi, Vietnam", "Ho Chi Minh City, Vietnam"]));
  it("matches a word inside a city name", () => expect(labels("minh")).toEqual(["Ho Chi Minh City, Vietnam"]));
  it("keeps same-named cities apart", () => expect(labels("paris")).toEqual(["Paris, France", "Paris, United States"]));
  it("returns nothing for an empty query", () => expect(labels("  ")).toEqual([]));
});
