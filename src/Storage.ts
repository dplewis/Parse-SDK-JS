import CoreManager from './CoreManager';

const Storage = {
  async(): boolean {
    const controller = CoreManager.getStorageController();
    return !!controller.async;
  },

  getItem(path: string): string | null {
    const controller = CoreManager.getStorageController();
    if (controller.async === 1) {
      throw new Error('Synchronous storage is not supported by the current storage controller');
    }
    return controller.getItem(path);
  },

  getItemAsync(path: string): Promise<string | null> {
    const controller = CoreManager.getStorageController();
    if (controller.async === 1) {
      return controller.getItemAsync(path);
    }
    return Promise.resolve(controller.getItem(path));
  },

  setItem(path: string, value: string): void {
    const controller = CoreManager.getStorageController();
    if (controller.async === 1) {
      throw new Error('Synchronous storage is not supported by the current storage controller');
    }
    return controller.setItem(path, value);
  },

  setItemAsync(path: string, value: string): Promise<void> {
    const controller = CoreManager.getStorageController();
    if (controller.async === 1) {
      return controller.setItemAsync(path, value);
    }
    return Promise.resolve(controller.setItem(path, value));
  },

  removeItem(path: string): void {
    const controller = CoreManager.getStorageController();
    if (controller.async === 1) {
      throw new Error('Synchronous storage is not supported by the current storage controller');
    }
    return controller.removeItem(path);
  },

  removeItemAsync(path: string): Promise<void> {
    const controller = CoreManager.getStorageController();
    if (controller.async === 1) {
      return controller.removeItemAsync(path);
    }
    return Promise.resolve(controller.removeItem(path));
  },

  getAllKeys(): string[] {
    const controller = CoreManager.getStorageController();
    if (controller.async === 1) {
      throw new Error('Synchronous storage is not supported by the current storage controller');
    }
    return controller.getAllKeys!();
  },

  getAllKeysAsync(): Promise<string[]> {
    const controller = CoreManager.getStorageController();
    if (controller.async === 1) {
      return controller.getAllKeysAsync!();
    }
    return Promise.resolve(controller.getAllKeys!());
  },

  generatePath(path: string): string {
    if (!CoreManager.get('APPLICATION_ID')) {
      throw new Error('You need to call Parse.initialize before using Parse.');
    }
    if (typeof path !== 'string') {
      throw new Error('Tried to get a Storage path that was not a String.');
    }
    if (path[0] === '/') {
      path = path.substr(1);
    }
    return 'Parse/' + CoreManager.get('APPLICATION_ID') + '/' + path;
  },

  _clear() {
    const controller = CoreManager.getStorageController();
    if (Object.hasOwn(controller, 'clear')) {
      controller.clear();
    }
  },
};

export default Storage;
