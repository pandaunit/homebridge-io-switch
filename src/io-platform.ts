import { AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin } from "homebridge";
import { SwitchAccessory } from "./switch-accessory";
import { StatelessSwitchAccessory } from "./stateless-switch-accessory";
import { LockAccessory } from "./lock-accessory";
import { WindowCoveringAccessory } from "./window-covering-accessory";
var MCP23017 = require('node-mcp23017');

const PLATFORM_NAME = "InputOutputPlatform";

let hap: HAP;

export = (api: API) => {
  hap = api.hap;

  api.registerPlatform(PLATFORM_NAME, InputOutputPlatform);
};

class InputOutputPlatform implements StaticPlatformPlugin {

  private readonly log: Logging;
  private readonly mcp: typeof MCP23017;
  private readonly accs: Array<SwitchAccessory | StatelessSwitchAccessory | LockAccessory | WindowCoveringAccessory>;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.accs = [];

    this.mcp = new MCP23017({
      address: parseInt(config.address),
      device: config.i2cDeviceIndex || 1,
      debug: config.debug || false
    });

    for (const device of config.devices) {
      switch (device.type) {
        case "switch":
          this.accs.push(new SwitchAccessory(hap, this.log, this.mcp, device));
          break;
        case "stateless-switch":
          this.accs.push(new StatelessSwitchAccessory(hap, this.log, this.mcp, device));
          break;
        case "lock":
          this.accs.push(new LockAccessory(hap, this.log, this.mcp, device));
          break;
        case "window-covering":
          this.accs.push(new WindowCoveringAccessory(hap, this.log, this.mcp, device));
          break;
      }
    }

    log.info("IO platform finished initializing!");
  }

  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    callback(this.accs);
  }

}
