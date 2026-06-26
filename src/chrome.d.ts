declare namespace chrome {
  namespace runtime {
    interface InstalledDetails {
      reason: string;
      previousVersion?: string;
      id?: string;
    }
    const onInstalled: {
      addListener(callback: (details: InstalledDetails) => void): void;
    };
  }

  namespace storage {
    interface StorageArea {
      get(
        keys: string | string[] | object | null,
        callback: (items: { [key: string]: unknown }) => void
      ): void;
      set(items: object, callback?: () => void): void;
    }

    const local: StorageArea;
    const session: StorageArea;

    interface StorageChange {
      newValue?: unknown;
      oldValue?: unknown;
    }

    const onChanged: {
      addListener(
        callback: (changes: { [key: string]: StorageChange }, areaName: string) => void
      ): void;
    };
  }
}

interface Window {
  isMdDocsContextValid?: () => boolean;
  mdDocsActive?: boolean;
  isMdSheetsContextValid?: () => boolean;
  mdSheetsActive?: boolean;
  isMdDriveContextValid?: () => boolean;
  mdDriveActive?: boolean;
}
