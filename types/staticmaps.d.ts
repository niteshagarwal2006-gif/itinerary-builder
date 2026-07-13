declare module "staticmaps" {
  interface StaticMapsOptions {
    width: number;
    height: number;
    paddingX?: number;
    paddingY?: number;
    tileUrl?: string;
    tileSubdomains?: string[];
    tileLayers?: unknown[];
    tileRequestTimeout?: number;
    tileRequestHeader?: Record<string, string>;
    maxZoom?: number;
    reverseY?: boolean;
    zoomRange?: { min?: number; max?: number };
  }

  interface CircleOptions {
    coord: [number, number];
    radius: number;
    color?: string;
    fill?: string;
    width?: number;
  }

  interface LineOptions {
    coords: [number, number][];
    color?: string;
    width?: number;
  }

  interface Image {
    save(path: string): Promise<void>;
    buffer(mime: string): Promise<Buffer>;
  }

  class StaticMaps {
    constructor(options: StaticMapsOptions);
    addCircle(options: CircleOptions): void;
    addLine(options: LineOptions): void;
    addMarker(options: unknown): void;
    render(center?: [number, number], zoom?: number): Promise<void>;
    image: Image;
  }

  export = StaticMaps;
}
