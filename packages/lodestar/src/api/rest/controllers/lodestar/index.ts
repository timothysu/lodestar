import {ApiController} from "../types";
import {DefaultQuery} from "fastify";

export const getWtfNode: ApiController<DefaultQuery> = {
  url: "/wtfnode/",
  handler: function (req, resp) {
    resp.status(200).send(this.api.lodestar.getWtfNode());
  },
  opts: {},
};

export const getHeapdump: ApiController<DefaultQuery> = {
  url: "/write-heapdump/",
  handler: function (req, resp) {
    // eslint-disable-next-line
    const heapdump = require("heapdump");
    const file = `lodestar-beacon-${new Date().toISOString()}.heapsnapshot`;
    heapdump.writeSnapshot(file, function (err: Error, filename: string) {
      if (err) resp.status(500).send(err);
      else resp.status(200).send(`Wrote heapdump to ${filename}`);
    });
  },
  opts: {},
};
