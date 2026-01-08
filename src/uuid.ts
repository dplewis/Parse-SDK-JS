const uuid = (): string => {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error(
      'crypto.randomUUID is not available. ' +
      'For React Native, import "react-native-random-uuid"'
    );
  }
  return crypto.randomUUID();
};

export default uuid;
