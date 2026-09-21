#!/usr/bin/env node
import { render } from "ink";
import { createElement } from "react";

import { App } from "./ui/app.js";

const instance = render(createElement(App, { name: "monsa" }));

await instance.waitUntilExit();
