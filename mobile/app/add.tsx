import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';

import { createMemory } from '../services/api';

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

export default function AddScreen() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saveMemory = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const memory = await createMemory({
        title: title.trim(),
        content: content.trim(),
        category: category.trim() || undefined,
        tags: parseTags(tags)
      });

      router.replace({
        pathname: '/memories/[id]',
        params: { id: memory._id }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create memory');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="A useful title"
          style={styles.input}
        />

        <Text style={styles.label}>Content</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          placeholder="What do you want to remember?"
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Category</Text>
        <TextInput
          value={category}
          onChangeText={setCategory}
          placeholder="general"
          style={styles.input}
        />

        <Text style={styles.label}>Tags</Text>
        <TextInput
          value={tags}
          onChangeText={setTags}
          placeholder="comma, separated, tags"
          autoCapitalize="none"
          style={styles.input}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          disabled={saving}
          style={[styles.primaryButton, saving && styles.disabledButton]}
          onPress={saveMemory}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Save memory</Text>
          )}
        </Pressable>

        <Pressable disabled={saving} style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f7f8'
  },
  content: {
    padding: 16
  },
  label: {
    color: '#111827',
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 12
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d1d5db',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textArea: {
    minHeight: 150
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    marginTop: 20,
    padding: 14
  },
  disabledButton: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  secondaryButton: {
    alignItems: 'center',
    marginTop: 14,
    padding: 12
  },
  secondaryButtonText: {
    color: '#2563eb',
    fontWeight: '700'
  },
  errorText: {
    color: '#b91c1c',
    marginTop: 12
  }
});
