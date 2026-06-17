import { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { colors } from '../../styles/theme';

export default function CreateTab() {
  useEffect(() => {
    router.replace('/add');
  }, []);

  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
