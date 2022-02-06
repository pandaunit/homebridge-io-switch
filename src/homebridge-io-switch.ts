import { AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin, } from "homebridge";
import { IOSwitch, Device } from "./switch-accessory";
var MCP23017 = require('node-mcp23017');

const PLATFORM_NAME = "IOSwitchPlatform";

let hap: HAP;

export = (api: API) => {
  hap = api.hap;

  api.registerPlatform(PLATFORM_NAME, IOSwitchPlatform);
};

class IOSwitchPlatform implements StaticPlatformPlugin {

  private readonly log: Logging;
  private readonly mcp: typeof MCP23017;
  private readonly devices: Array<Device>;
  private readonly switches: Array<IOSwitch>;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.devices = config.devices;
    this.switches = [];

    this.mcp = new MCP23017({
      address: parseInt(config.address),
      device: config.i2cDeviceIndex || 1,
      debug: config.debug || false
    });

    for (const device of this.devices) {
      this.switches.push(new IOSwitch(hap, this.log, this.mcp, device));
    }

    log.info("Example platform finished initializing!");
  }

  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    callback(this.switches);
  }

}
