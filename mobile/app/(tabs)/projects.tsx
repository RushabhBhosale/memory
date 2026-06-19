import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../../components/ScreenHeader';
import {
  createProject,
  listProjects,
  type Project
} from '../../services/api';
import { cardShadow, colors } from '../../styles/theme';

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async (options?: { refreshing?: boolean }) => {
    try {
      if (options?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      setProjects(await listProjects());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load projects');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [loadProjects])
  );

  const saveProject = async () => {
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined
      });

      setName('');
      setDescription('');
      setProjects((currentProjects) => [project, ...currentProjects]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader mode="back" title="Projects" />

      <View style={styles.createPanel}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Project name"
          placeholderTextColor={colors.textSoft}
          style={styles.input}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Short description"
          placeholderTextColor={colors.textSoft}
          style={styles.input}
        />
        <Pressable
          disabled={saving}
          style={[styles.primaryButton, saving && styles.disabledButton]}
          onPress={saveProject}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Create project</Text>
          )}
        </Pressable>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Loading projects...</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item._id}
          contentContainerStyle={projects.length ? styles.list : styles.centerState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              colors={[colors.primary]}
              onRefresh={() => loadProjects({ refreshing: true })}
            />
          }
          ListEmptyComponent={<Text style={styles.mutedText}>No projects yet.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.projectCard, pressed && styles.cardPressed]}
              onPress={() =>
                router.push({
                  pathname: '/projects/[id]',
                  params: { id: item._id }
                })
              }
            >
              <Text style={styles.projectName}>{item.name}</Text>
              {item.description ? (
                <Text numberOfLines={2} style={styles.projectDescription}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.projectMeta}>
                {item.status} · Updated {formatDate(item.updatedAt)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 22
  },
  createPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginBottom: 12,
    padding: 12,
    ...cardShadow
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 13
  },
  disabledButton: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: colors.surface,
    fontWeight: '800'
  },
  projectCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
    ...cardShadow
  },
  cardPressed: {
    opacity: 0.82
  },
  projectName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6
  },
  projectDescription: {
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 8
  },
  projectMeta: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  list: {
    paddingBottom: 88
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingBottom: 80
  },
  mutedText: {
    color: colors.textMuted
  },
  errorText: {
    color: colors.danger,
    marginBottom: 10,
    textAlign: 'center'
  }
});
