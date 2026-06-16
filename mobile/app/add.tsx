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
import { cardShadow, colors } from '../styles/theme';

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
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const parsedTags = parseTags(tags);
      await createMemory({
        title: title.trim(),
        content: content.trim() || undefined,
        category: category.trim() || undefined,
        tags: parsedTags.length ? parsedTags : undefined
      });

      router.replace('/');
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
        <View style={styles.panel}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="A useful title"
            placeholderTextColor={colors.textSoft}
            style={styles.input}
          />

          <Text style={styles.label}>Content</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            multiline
            placeholder="Add detail when it helps"
            placeholderTextColor={colors.textSoft}
            style={[styles.input, styles.textArea]}
            textAlignVertical="top"
          />

          <View style={styles.twoColumnRow}>
            <View style={styles.fieldColumn}>
              <Text style={styles.label}>Category</Text>
              <TextInput
                value={category}
                onChangeText={setCategory}
                placeholder="general"
                placeholderTextColor={colors.textSoft}
                style={styles.input}
              />
            </View>
          </View>

          <Text style={styles.label}>Tags</Text>
          <TextInput
            value={tags}
            onChangeText={setTags}
            placeholder="comma, separated, tags"
            placeholderTextColor={colors.textSoft}
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

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
    backgroundColor: colors.background
  },
  content: {
    padding: 18,
    paddingBottom: 32
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    ...cardShadow
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 14
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 13,
    paddingVertical: 12
  },
  textArea: {
    minHeight: 150,
    lineHeight: 22
  },
  twoColumnRow: {
    flexDirection: 'row'
  },
  fieldColumn: {
    flex: 1
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 8,
    marginTop: 18,
    padding: 15
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
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    marginTop: 12,
    padding: 12
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '700'
  },
  errorText: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 8,
    color: colors.danger,
    marginTop: 14,
    padding: 12,
    textAlign: 'center'
  }
});
