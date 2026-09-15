import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { issueHref, listHref, listViewFrom } from "../lib/views";

/**
 * Closing an issue has to land on the list it was opened from.
 *
 * Opening one is intercepted into a pane, so closing it is a back navigation and nothing
 * needs to be remembered. A refresh is not intercepted — the same URL renders the full
 * page — and from there the URL is the only thing left that knows where the reader came
 * from. Without `from`, closing an issue opened on the board dropped them in the backlog.
 */
describe("listViewFrom", () => {
  it("accepts the views that exist", () => {
    assert.equal(listViewFrom("board"), "board");
    assert.equal(listViewFrom("tree"), "tree");
    assert.equal(listViewFrom("my-work"), "my-work");
  });

  it("falls back to the backlog for anything else", () => {
    // A pasted link carries no `from` at all.
    assert.equal(listViewFrom(undefined), "backlog");
    assert.equal(listViewFrom("sprints"), "backlog");
    // Repeated query keys arrive as an array.
    assert.equal(listViewFrom(["board", "tree"]), "backlog");
    // The whole reason this is a whitelist: the value ends up in a navigation.
    assert.equal(listViewFrom("//evil.example.com"), "backlog");
    assert.equal(listViewFrom("../../etc"), "backlog");
  });
});

describe("listHref", () => {
  it("returns to the list still showing what it was showing", () => {
    assert.equal(listHref("board", { project: "prj_1" }), "/board?project=prj_1");
    assert.equal(listHref("backlog", { project: "prj_1" }), "/backlog?project=prj_1");
    assert.equal(listHref("my-work", {}), "/my-work");
  });

  it("keeps the tree focused on the branch it was focused on", () => {
    assert.equal(
      listHref("tree", { project: "prj_1", root: "iss_9" }),
      "/tree?project=prj_1&root=iss_9",
    );
    // `root` means nothing anywhere else, so it is not carried there.
    assert.equal(listHref("board", { project: "prj_1", root: "iss_9" }), "/board?project=prj_1");
  });

  it("leaves out a query it was not given", () => {
    assert.equal(listHref("board", {}), "/board");
    assert.equal(listHref("board", { project: "" }), "/board");
    assert.equal(listHref("board", { project: ["a", "b"] }), "/board");
  });
});

describe("issueHref", () => {
  it("stamps the origin view on and keeps the list's own query", () => {
    const params = new URLSearchParams({ project: "prj_1", root: "iss_9" });
    assert.equal(issueHref("GS-7", "tree", params), "/i/GS-7?project=prj_1&root=iss_9&from=tree");
    assert.equal(issueHref("GS-7", "my-work"), "/i/GS-7?from=my-work");
  });

  it("does not leave a stale origin behind when moving between views", () => {
    const params = new URLSearchParams({ project: "prj_1", from: "backlog" });
    assert.equal(issueHref("GS-7", "board", params), "/i/GS-7?project=prj_1&from=board");
  });

  it("round-trips: what a row links to is what its close button reads back", () => {
    const href = issueHref("GS-7", "board", new URLSearchParams({ project: "prj_1" }));
    const query = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
    assert.equal(listHref(listViewFrom(query.from), query), "/board?project=prj_1");
  });
});
