import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { MemoryCard } from '../../components/MemoryCard';
import {
  getProject,
  listProjectMemories,
  type Memory,
  type Project
} from '../../services/api';
import { cardShadow, colors } from '../../styles/theme';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));

export default function ProjectDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProject = useCallback(async () => {
    if (!id) {
      setError('Project id is missing');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const [nextProject, nextMemories] = await Promise.all([
        getProject(id),
        listProjectMemories(id)
      ]);

      setProject(nextProject);
      setMemories(nextMemories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator />
        <Text style={styles.mutedText}>Loading project...</Text>
      </View>
    );
  }

  if (error && !project) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.secondaryButton} onPress={loadProject}>
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.mutedText}>Project not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerPanel}>
        <Text style={styles.status}>{project.status}</Text>
        <Text style={styles.title}>{project.name}</Text>
        {project.description ? (
          <Text style={styles.description}>{project.description}</Text>
        ) : null}
        <Text style={styles.date}>Created {formatDateTime(project.createdAt)}</Text>
        <Text style={styles.date}>Updated {formatDateTime(project.updatedAt)}</Text>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() =>
          router.push({
            pathname: '/add',
            params: { projectId: project._id }
          })
        }
      >
        <Text style={styles.primaryButtonText}>Add project memory</Text>
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Saved work</Text>
      {memories.length ? (
        memories.map((memory) => <MemoryCard key={memory._id} memory={memory} />)
      ) : (
        <Text style={styles.emptyText}>No entries for this project yet.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 18,
    paddingBottom: 34
  },
  headerPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
    ...cardShadow
  },
  status: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 12
  },
  description: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 14
  },
  date: {
    color: colors.textSoft,
    marginBottom: 4
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 8,
    marginTop: 16,
    padding: 14
  },
  primaryButtonText: {
    color: colors.surface,
    fontWeight: '800'
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
    marginTop: 20,
    textTransform: 'uppercase'
  },
  emptyText: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.textSoft,
    padding: 16,
    textAlign: 'center'
  },
  secondaryButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '700'
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 16
  },
  mutedText: {
    color: colors.textMuted
  },
  errorText: {
    color: colors.danger,
    marginTop: 16,
    textAlign: 'center'
  }
});
