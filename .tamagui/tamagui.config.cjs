var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/shared-components/src/tamagui.config.web.ts
var tamagui_config_web_exports = {};
__export(tamagui_config_web_exports, {
  default: () => tamagui_config_web_default
});
module.exports = __toCommonJS(tamagui_config_web_exports);
var tamaguiConfig = {
  themes: {
    light: {
      background: "#ffffff",
      color: "#000000"
    },
    dark: {
      background: "#000000",
      color: "#ffffff"
    }
  },
  tokens: {
    space: {
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      true: 16
    },
    size: {
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      true: 16
    },
    color: {
      white: "#ffffff",
      black: "#000000",
      blue: "#3366FF"
    }
  },
  fonts: {
    body: {
      family: "Inter, system-ui, sans-serif",
      size: {
        1: 11,
        2: 12,
        3: 13,
        4: 14,
        true: 14
      }
    }
  },
  shorthands: {},
  media: {},
  animations: {},
  settings: {},
  fontLanguages: ["en"]
};
var tamagui_config_web_default = tamaguiConfig;
