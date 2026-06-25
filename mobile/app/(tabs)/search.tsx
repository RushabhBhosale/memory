import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemoryCard } from '../../components/MemoryCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StateView } from '../../components/StateView';
import { askMemory, type AskMemoryResponse } from '../../services/api';
import { colors, subtleShadow } from '../../styles/theme';
import { getRecentSearches, saveRecentSearch } from '../../utils/searchHistory';

const QUICK_CHIPS = [
  { label: 'Today', query: 'What did I work on today?' },
  { label: 'This Week', query: 'What happened this week?' },
  { label: 'Recent Logs', query: 'Show my recent logs.' },
  { label: 'Upcoming Reminders', query: 'Any reminders due tomorrow?' }
] as const;

const EXAMPLE_QUERIES = [
  {
    icon: 'briefcase-outline' as const,
    label: 'Work recap',
    query: 'What did I work on today?'
  },
  {
    icon: 'hardware-chip-outline' as const,
    label: 'ActiveX',
    query: 'Anything on ActiveX?'
  },
  {
    icon: 'shield-checkmark-outline' as const,
    label: 'JWT',
    query: 'What do I know about JWT?'
  },
  {
    icon: 'calendar-outline' as const,
    label: 'Meeting prep',
    query: 'Prepare me for tomorrow’s ActiveX meeting.'
  }
] as const;

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [response, setResponse] = useState<AskMemoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadRecentSearches = async () => {
        const items = await getRecentSearches();

        if (active) {
          setRecentSearches(items);
        }
      };

      void loadRecentSearches();

      return () => {
        active = false;
      };
    }, [])
  );

  const runAskMemory = async (value = query) => {
    const nextQuery = value.trim();

    if (!nextQuery) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      setQuery(nextQuery);
      const nextResponse = await askMemory(nextQuery);
      setResponse(nextResponse);
      setRecentSearches(await saveRecentSearch(nextQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search memories');
    } finally {
      setLoading(false);
    }
  };

  const hasConversation = loading || Boolean(error) || Boolean(response);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader mode="back" title="Ask Memory" />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroGlowLeft} />
          <View style={styles.heroGlowRight} />

          <View style={styles.heroBadge}>
            <Ionicons color={colors.primary} name="sparkles-outline" size={14} />
            <Text style={styles.heroBadgeText}>AI Memory Search</Text>
          </View>

          <View style={styles.heroVisual}>
            <View style={styles.visualFrameOuter}>
              <View style={styles.visualFrameMiddle}>
                <View style={styles.visualFrameInner}>
                  <Ionicons color={colors.primary} name="planet-outline" size={34} />
                </View>
              </View>
            </View>
            <View style={styles.visualFloatingTop}>
              <Ionicons color={colors.secondary} name="flash-outline" size={14} />
            </View>
            <View style={styles.visualFloatingBottom}>
              <Ionicons color={colors.primary} name="search-outline" size={14} />
            </View>
          </View>

          <Text style={styles.heroTitle}>Search your second brain</Text>
          <Text style={styles.heroSubtitle}>
            Ask natural questions and get answers grounded in your saved memories, logs, meetings,
            tasks, reminders, and notes.
          </Text>

          <View style={styles.searchDock}>
            <View style={styles.searchField}>
              <Ionicons color={colors.textSoft} name="sparkles-outline" size={20} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => void runAskMemory()}
                placeholder="Ask anything..."
                placeholderTextColor={colors.textSoft}
                returnKeyType="search"
                style={styles.searchInput}
              />
            </View>

            <Pressable
              disabled={loading}
              style={[styles.sendButton, loading && styles.sendButtonDisabled]}
              onPress={() => void runAskMemory()}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Ionicons color={colors.white} name="arrow-up" size={18} />
              )}
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickChipRow}
          style={styles.quickChipScroller}
        >
          {QUICK_CHIPS.map((chip) => (
            <Pressable key={chip.label} style={styles.quickChip} onPress={() => void runAskMemory(chip.query)}>
              <Text style={styles.quickChipText}>{chip.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {!hasConversation ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Continue searching</Text>
            </View>
            {recentSearches.length ? (
              <View style={styles.recentWrap}>
                {recentSearches.map((item) => (
                  <Pressable
                    key={item}
                    style={styles.recentChip}
                    onPress={() => void runAskMemory(item)}
                  >
                    <Text numberOfLines={1} style={styles.recentChipText}>
                      {item}
                    </Text>
                    <Ionicons color={colors.textMuted} name="close" size={14} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <StateView
                title="No recent searches yet"
                detail="Your recent AI searches will show up here."
              />
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Start exploring</Text>
            </View>
            <View style={styles.exploreGrid}>
              {EXAMPLE_QUERIES.map((item) => (
                <Pressable
                  key={item.query}
                  style={styles.exploreCard}
                  onPress={() => void runAskMemory(item.query)}
                >
                  <View style={styles.exploreIcon}>
                    <Ionicons color={colors.primary} name={item.icon} size={18} />
                  </View>
                  <Text style={styles.exploreLabel}>{item.label}</Text>
                  <Text numberOfLines={3} style={styles.exploreQuery}>
                    {item.query}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : loading ? (
          <StateView title="Searching your memory" detail="Planning, retrieving, and answering." loading />
        ) : error ? (
          <StateView title={error} tone="error" />
        ) : response ? (
          <View style={styles.responseArea}>
            <View style={styles.questionCard}>
              <Text style={styles.questionEyebrow}>Your question</Text>
              <Text style={styles.questionText}>{query}</Text>
            </View>

            <View style={styles.answerCard}>
              <View style={styles.answerHeader}>
                <View style={styles.answerIconWrap}>
                  <Ionicons color={colors.primary} name="sparkles-outline" size={18} />
                </View>
                <Text style={styles.answerHeaderText}>Memory answer</Text>
              </View>

              <Text style={styles.answerText}>{response.answer}</Text>

              {response.summary.length ? (
                <View style={styles.summaryList}>
                  {response.summary.map((item) => (
                    <View key={item} style={styles.summaryRow}>
                      <View style={styles.summaryDot} />
                      <Text style={styles.summaryText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{response.count}</Text>
                  <Text style={styles.statLabel}>Items found</Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Sources</Text>
              {response.plan.keywords.length ? (
                <Text numberOfLines={1} style={styles.sourceHint}>
                  {response.plan.keywords.join(' • ')}
                </Text>
              ) : null}
            </View>

            <View style={styles.sourceList}>
              {response.sources.map((item) => (
                <MemoryCard key={`${item.type}-${item._id}`} memory={item} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingBottom: 112,
    paddingHorizontal: 22
  },
  heroCard: {
    backgroundColor: '#F8FBFF',
    borderColor: '#E7EEF8',
    borderRadius: 30,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    position: 'relative',
    ...subtleShadow
  },
  heroGlowLeft: {
    backgroundColor: '#EBF3FF',
    borderRadius: 120,
    height: 200,
    left: -70,
    opacity: 0.9,
    position: 'absolute',
    top: 80,
    width: 200
  },
  heroGlowRight: {
    backgroundColor: '#F7ECFF',
    borderRadius: 120,
    height: 180,
    opacity: 0.95,
    position: 'absolute',
    right: -48,
    top: 40,
    width: 180
  },
  heroBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: '#E6EAF2',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  heroBadgeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800'
  },
  heroVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 26,
    marginBottom: 24,
    minHeight: 180,
    position: 'relative'
  },
  visualFrameOuter: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderColor: '#CFE0F7',
    borderRadius: 999,
    borderWidth: 1,
    height: 170,
    justifyContent: 'center',
    width: 170
  },
  visualFrameMiddle: {
    alignItems: 'center',
    backgroundColor: '#EEF5FF',
    borderColor: '#D8E7FB',
    borderRadius: 999,
    borderWidth: 1,
    height: 122,
    justifyContent: 'center',
    width: 122
  },
  visualFrameInner: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 999,
    height: 84,
    justifyContent: 'center',
    width: 84,
    ...subtleShadow
  },
  visualFloatingTop: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: '#E6ECF5',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: 70,
    top: 24,
    width: 34
  },
  visualFloatingBottom: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: '#E6ECF5',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 18,
    height: 34,
    justifyContent: 'center',
    left: 78,
    position: 'absolute',
    width: 34
  },
  heroTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
    textAlign: 'center'
  },
  heroSubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: 10,
    paddingHorizontal: 10,
    textAlign: 'center'
  },
  searchDock: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: '#E6EAF2',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...subtleShadow
  },
  searchField: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 28
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    padding: 0
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  sendButtonDisabled: {
    opacity: 0.72
  },
  quickChipScroller: {
    marginBottom: 22
  },
  quickChipRow: {
    gap: 10,
    paddingRight: 12
  },
  quickChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...subtleShadow
  },
  quickChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800'
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900'
  },
  recentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28
  },
  recentChip: {
    alignItems: 'center',
    backgroundColor: '#F5F7FB',
    borderColor: '#E8ECF3',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  recentChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 240
  },
  exploreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  exploreCard: {
    backgroundColor: '#F4F2FF',
    borderRadius: 18,
    minHeight: 152,
    padding: 14,
    width: '48%'
  },
  exploreIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    marginBottom: 16,
    width: 34
  },
  exploreLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8
  },
  exploreQuery: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20
  },
  responseArea: {
    gap: 14
  },
  questionCard: {
    alignSelf: 'flex-end',
    backgroundColor: colors.text,
    borderRadius: 22,
    maxWidth: '88%',
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  questionEyebrow: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6
  },
  questionText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22
  },
  answerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    ...subtleShadow
  },
  answerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  answerIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.accentSurface,
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  answerHeaderText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800'
  },
  answerText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 28
  },
  summaryList: {
    gap: 10,
    marginTop: 14
  },
  summaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10
  },
  summaryDot: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 7,
    marginTop: 8,
    width: 7
  },
  summaryText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18
  },
  statCard: {
    backgroundColor: colors.backgroundSoft,
    borderRadius: 18,
    flex: 1,
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  statValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32
  },
  statValueSmall: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6
  },
  sourceHint: {
    color: colors.textSoft,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 12,
    textAlign: 'right'
  },
  sourceList: {
    marginTop: -2
  }
});
