interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDCollection {
  usagePage?: number;
  usage?: number;
}

interface HIDDevice extends EventTarget {
  opened: boolean;
  collections: HIDCollection[];
  open(): Promise<void>;
  close(): Promise<void>;
  addEventListener(type: 'inputreport', listener: (e: HIDInputReportEvent) => void): void;
  removeEventListener(type: 'inputreport', listener: (e: HIDInputReportEvent) => void): void;
}

interface HIDInputReportEvent extends Event {
  data: DataView;
}

interface HID {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice>;
}

interface Navigator {
  hid?: HID;
}
