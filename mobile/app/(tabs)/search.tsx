import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  type ViewStyle,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader, HeaderIcon } from '../../components/AppHeader';
import { MemoryCard } from '../../components/MemoryCard';
import { askMemory, type ActivityItem, type AskMemoryResponse } from '../../services/api';
import { colors, subtleShadow } from '../../styles/theme';
import { getRecentSearches, saveRecentSearch } from '../../utils/searchHistory';

const CHAT_STORAGE_KEY = 'ask_memory_chat_history_v2';
const MAX_STORED_CONVERSATIONS = 20;

const SUGGESTED_PROMPTS = [
  'What did I do today?',
  'Anything on ActiveX?',
  'What are my pending tasks?',
  'What did I spend this month?',
  'What should I follow up on?'
] as const;

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  response?: AskMemoryResponse;
  loading?: boolean;
  error?: boolean;
  followUps?: string[];
};

type StoredConversation = {
  id: string;
  messages: ChatMessage[];
  updatedAt: string;
};

const makeMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getParamValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const normalizeStoredMessages = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as ChatMessage[];
  }

  return value
    .filter((item): item is ChatMessage => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const message = item as Partial<ChatMessage>;
      return (
        typeof message.id === 'string' &&
        (message.role === 'assistant' || message.role === 'user') &&
        typeof message.text === 'string'
      );
    })
    .map((item) => ({ ...item, loading: false }));
};

const getConversationPairs = (messages: ChatMessage[]) => {
  const pairs: StoredConversation[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];

    if (message.role !== 'user') {
      continue;
    }

    const nextAssistant = messages.slice(index + 1).find((item) => item.role === 'assistant');

    pairs.push({
      id: message.id,
      messages: [message, ...(nextAssistant ? [nextAssistant] : [])],
      updatedAt: new Date().toISOString()
    });
  }

  return pairs.slice(-MAX_STORED_CONVERSATIONS);
};

const ANSWER_STOP_WORDS = new Set([
  'about',
  'and',
  'did',
  'for',
  'from',
  'have',
  'how',
  'the',
  'this',
  'that',
  'today',
  'what',
  'when',
  'where',
  'with',
  'work'
]);
const FOLLOW_UP_STOP_WORDS = new Set(['about', 'did', 'go', 'today', 'what', 'where', 'work']);

const getAnswerKeywords = (question: string) =>
  question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && !ANSWER_STOP_WORDS.has(item));

const compactAnswerText = (value: string) => value.replace(/\s+/g, ' ').trim();

const getSourceText = (source: ActivityItem) =>
  [
    source.content,
    source.summary,
    source.bodyMarkdown,
    source.originalSmsPreview,
    source.merchant,
    source.title
  ]
    .filter(Boolean)
    .join('\n');

const getMatchedSourceLine = (source: ActivityItem, keywords: string[]) => {
  const candidates = getSourceText(source)
    .split(/\n+|[.!?]\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const matched = candidates.find((candidate) => {
    const normalized = candidate.toLowerCase();
    return keywords.some((keyword) => normalized.includes(keyword));
  });

  return compactAnswerText(matched || candidates[0] || source.title);
};

const buildReadableAnswer = (question: string, response: AskMemoryResponse) => {
  const genericAnswer = /^I found \d+ saved item/i.test(response.answer);

  if (!genericAnswer || response.sources.length === 0) {
    return response.answer;
  }

  const keywords = getAnswerKeywords(question);
  const sourceLines = Array.from(
    new Set(response.sources.slice(0, 4).map((source) => getMatchedSourceLine(source, keywords)).filter(Boolean))
  );
  const matchedLines = sourceLines.slice(0, 3);

  if (!matchedLines.length) {
    return response.answer;
  }

  return `I found ${response.count} saved item${
    response.count === 1 ? '' : 's'
  } related to your question. ${matchedLines.join(' ')}`;
};

const buildFollowUps = (question: string, response: AskMemoryResponse) => {
  const topics = [
    ...response.plan.keywords,
    ...response.sources.flatMap((item) => [item.category, ...item.tags.slice(0, 1)])
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && !FOLLOW_UP_STOP_WORDS.has(item.toLowerCase()));
  const uniqueTopics = Array.from(new Set(topics.map((item) => item.toLowerCase()))).slice(0, 2);
  const followUps = uniqueTopics.map((topic) => `Show me more about ${topic}.`);

  if (response.sources.some((item) => item.kind === 'task' || item.type === 'task')) {
    followUps.push('Which of these tasks are still pending?');
  }

  if (response.count > 1) {
    followUps.push('Summarize this as a timeline.');
  }

  if (!followUps.length) {
    followUps.push('What should I follow up on?', `Find related memories for "${question}".`);
  }

  return Array.from(new Set(followUps)).slice(0, 3);
};

function MessageBubble({
  message
}: {
  message: ChatMessage;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === 'user';
  const sourceCount = !isUser ? message.response?.sources.length ?? 0 : 0;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        duration: 180,
        toValue: 1,
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        duration: 180,
        toValue: 0,
        useNativeDriver: true
      })
    ]).start();
  }, [fade, translateY]);

  return (
    <Animated.View
      style={[
        styles.messageWrap,
        isUser ? styles.userMessageWrap : styles.assistantMessageWrap,
        { opacity: fade, transform: [{ translateY }] }
      ]}
    >
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {!isUser ? (
          <View style={styles.assistantHeader}>
            <View style={styles.assistantAvatar}>
              <Ionicons color={colors.text} name="sparkles-outline" size={15} />
            </View>
            <Text style={styles.assistantName}>Memory</Text>
          </View>
        ) : null}

        <View style={styles.messageTextRow}>
          {message.loading ? <ActivityIndicator color={colors.textMuted} size="small" /> : null}
          <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
            {message.text}
          </Text>
        </View>

        {sourceCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showSources ? 'Hide sources' : 'Show sources'}
            style={styles.sourcesToggle}
            onPress={() => setShowSources((current) => !current)}
          >
            <View style={styles.sourcesToggleIcon}>
              <Ionicons color={colors.white} name="albums-outline" size={13} />
            </View>
            <Text style={styles.sourcesToggleText}>
              {showSources ? 'Hide sources' : `${sourceCount} source${sourceCount === 1 ? '' : 's'}`}
            </Text>
            <Ionicons color={colors.textMuted} name={showSources ? 'chevron-up' : 'chevron-down'} size={14} />
          </Pressable>
        ) : null}
      </View>

      {!isUser && showSources && message.response?.sources.length ? (
        <View style={styles.sourcesBlock}>
          <Text style={styles.blockLabel}>Sources</Text>
          {message.response.sources.slice(0, 5).map((item) => (
            <MemoryCard key={`${message.id}-${item.type}-${item._id}`} memory={item} />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

export default function SearchScreen() {
  const params = useLocalSearchParams<{
    assistantId?: string;
    assistantQuery?: string;
    assistantRun?: string;
  }>();
  const scrollRef = useRef<ScrollView | null>(null);
  const handledAssistantRef = useRef("");
  const [input, setInput] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const hasMessages = messages.length > 0;

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadChat = async () => {
        const [storedChat, items] = await Promise.all([
          AsyncStorage.getItem(CHAT_STORAGE_KEY),
          getRecentSearches()
        ]);

        if (!active) {
          return;
        }

        setRecentSearches(items);

        if (!storedChat) {
          return;
        }

        try {
          const parsed = JSON.parse(storedChat) as StoredConversation[];
          const flattened = Array.isArray(parsed)
            ? parsed.flatMap((conversation) => normalizeStoredMessages(conversation.messages))
            : normalizeStoredMessages(parsed);

          setMessages(flattened.slice(-MAX_STORED_CONVERSATIONS * 2));
        } catch {
          setMessages([]);
        }
      };

      void loadChat();

      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    const stableMessages = messages.filter((item) => !item.loading);
    const conversations = getConversationPairs(stableMessages).slice(-MAX_STORED_CONVERSATIONS);

    if (!conversations.length) {
      void AsyncStorage.removeItem(CHAT_STORAGE_KEY);
      return;
    }

    void AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations));
  }, [messages]);

  const scrollToLatest = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const clearChat = async () => {
    setMessages([]);
    setInput('');
    await AsyncStorage.removeItem(CHAT_STORAGE_KEY);
  };

  const runAskMemory = async (value = input) => {
    const nextQuery = value.trim();

    if (!nextQuery || loading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: makeMessageId(),
      role: 'user',
      text: nextQuery
    };
    const loadingMessageId = makeMessageId();
    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      role: 'assistant',
      text: 'Searching your memory...',
      loading: true
    };

    setInput('');
    setLoading(true);
    setMessages((current) => [...current, userMessage, loadingMessage].slice(-MAX_STORED_CONVERSATIONS * 2));
    scrollToLatest();

    try {
      const nextResponse = await askMemory(nextQuery);
      const followUps = buildFollowUps(nextQuery, nextResponse);
      const answerText = buildReadableAnswer(nextQuery, nextResponse);

      setRecentSearches(await saveRecentSearch(nextQuery));
      setMessages((current) =>
        current.map((message) =>
          message.id === loadingMessageId
            ? {
                id: loadingMessageId,
                role: 'assistant',
                text: answerText,
                response: nextResponse,
                followUps
              }
            : message
        )
      );
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.id === loadingMessageId
            ? {
                id: loadingMessageId,
                role: 'assistant',
                text: err instanceof Error ? err.message : 'Unable to search memories right now.',
                error: true,
                followUps: ['Try asking again.', 'Search today instead.']
              }
            : message
        )
      );
    } finally {
      setLoading(false);
      scrollToLatest();
    }
  };

  useEffect(() => {
    const query = getParamValue(params.assistantQuery)?.trim();
    const shouldRun = getParamValue(params.assistantRun) === "1";
    const id = getParamValue(params.assistantId) || query;

    if (!query || !id || handledAssistantRef.current === id) {
      return;
    }

    handledAssistantRef.current = id;
    console.log("[AppActions] Search deep link parsed", { query, shouldRun });
    setInput(query);

    if (shouldRun) {
      console.log("[AppActions] Running Assistant search", { query });
      void runAskMemory(query);
    }
  }, [params.assistantId, params.assistantQuery, params.assistantRun]);

  const latestFollowUps =
    [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && !message.loading && message.followUps?.length)
      ?.followUps?.slice(0, 4) ?? [];
  const promptItems = hasMessages ? latestFollowUps : SUGGESTED_PROMPTS;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
        style={styles.keyboard}
      >
        <AppHeader
          title="Ask Memory"
          showBackButton
          rightIcons={
            <HeaderIcon name="ellipsis-horizontal" onPress={() => {
              // TODO: options
            }} />
          }
        />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.messagesContent, !hasMessages && styles.emptyMessagesContent]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToLatest}
          showsVerticalScrollIndicator={false}
        >
          {!hasMessages ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons color={colors.text} name="sparkles-outline" size={25} />
              </View>
              <Text style={styles.emptyTitle}>How can I help with your memory?</Text>
              <Text style={styles.emptySubtitle}>
                Ask a question and I’ll search across your memories, tasks, reminders, notes, and logs.
              </Text>
              <View style={styles.promptGrid}>
                {SUGGESTED_PROMPTS.map((item) => (
                  <Pressable key={item} style={styles.promptChip} onPress={() => void runAskMemory(item)}>
                    <Text style={styles.promptText}>{item}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
        </ScrollView>

        {hasMessages && promptItems.length ? (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.inlinePromptsContent}
            style={styles.inlinePrompts}
          >
            {promptItems.map((item) => (
              <Pressable key={item} style={styles.inlinePrompt} onPress={() => void runAskMemory(item)}>
                <Text numberOfLines={1} style={styles.inlinePromptText}>
                  {item}
                </Text>
                <Ionicons color={colors.textMuted} name="arrow-up" size={14} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.composerWrap}>
          <View style={styles.composer}>
            <TextInput
              multiline
              value={input}
              editable={!loading}
              onChangeText={setInput}
              placeholder="Message Ask Memory..."
              placeholderTextColor={colors.textSoft}
              returnKeyType="default"
              style={styles.input}
            />
            <Pressable
              disabled={loading || !input.trim()}
              style={[
                styles.sendButton,
                (loading || !input.trim()) && styles.sendButtonDisabled
              ]}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type SearchStyles = {
  screen: ViewStyle;
  keyboard: ViewStyle;
  header: ViewStyle;
  headerButton: ViewStyle;
  headerButtonDisabled: ViewStyle;
  headerTitleWrap: ViewStyle;
  headerTitle: TextStyle;
  headerSubtitle: TextStyle;
  messagesContent: ViewStyle;
  emptyMessagesContent: ViewStyle;
  emptyState: ViewStyle;
  emptyIcon: ViewStyle;
  emptyTitle: TextStyle;
  emptySubtitle: TextStyle;
  promptGrid: ViewStyle;
  promptChip: ViewStyle;
  promptText: TextStyle;
  messageWrap: ViewStyle;
  userMessageWrap: ViewStyle;
  assistantMessageWrap: ViewStyle;
  messageBubble: ViewStyle;
  userBubble: ViewStyle;
  assistantBubble: ViewStyle;
  assistantHeader: ViewStyle;
  assistantAvatar: ViewStyle;
  assistantName: TextStyle;
  messageTextRow: ViewStyle;
  messageText: TextStyle;
  userText: TextStyle;
  assistantText: TextStyle;
  summaryList: ViewStyle;
  summaryRow: ViewStyle;
  summaryDot: ViewStyle;
  summaryText: TextStyle;
  resultMeta: ViewStyle;
  resultMetaText: TextStyle;
  sourcesToggle: ViewStyle;
  sourcesToggleIcon: ViewStyle;
  sourcesToggleText: TextStyle;
  sourcesBlock: ViewStyle;
  blockLabel: TextStyle;
  followUpBlock: ViewStyle;
  followUpList: ViewStyle;
  followUpChip: ViewStyle;
  followUpText: TextStyle;
  inlinePrompts: ViewStyle;
  inlinePromptsContent: ViewStyle;
  inlinePrompt: ViewStyle;
  inlinePromptText: TextStyle;
  composerWrap: ViewStyle;
  composer: ViewStyle;
  input: TextStyle;
  sendButton: ViewStyle;
  sendButtonDisabled: ViewStyle;
};

const styles = StyleSheet.create<SearchStyles>({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  keyboard: {
    flex: 1
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: 14
  },
  headerButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  headerButtonDisabled: {
    opacity: 0.45
  },
  headerTitleWrap: {
    alignItems: 'center',
    flex: 1
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 23
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16
  },
  messagesContent: {
    gap: 18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18
  },
  emptyMessagesContent: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  emptyState: {
    alignItems: 'center',
    paddingBottom: 24
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSoft,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    marginBottom: 18,
    width: 58
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
    maxWidth: 320,
    textAlign: 'center'
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 340,
    textAlign: 'center'
  },
  promptGrid: {
    gap: 10,
    marginTop: 26,
    width: '100%'
  },
  promptChip: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 14
  },
  promptText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  messageWrap: {
    maxWidth: '100%'
  },
  userMessageWrap: {
    alignItems: 'flex-end'
  },
  assistantMessageWrap: {
    alignItems: 'flex-start'
  },
  messageBubble: {
    borderRadius: 22,
    maxWidth: '88%',
    paddingHorizontal: 15,
    paddingVertical: 12
  },
  userBubble: {
    backgroundColor: colors.text,
    borderBottomRightRadius: 7
  },
  assistantBubble: {
    backgroundColor: colors.backgroundSoft,
    borderBottomLeftRadius: 7,
    borderColor: colors.border,
    borderWidth: 1
  },
  assistantHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8
  },
  assistantAvatar: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26
  },
  assistantName: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800'
  },
  messageTextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9
  },
  messageText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23
  },
  userText: {
    color: colors.white
  },
  assistantText: {
    color: colors.text
  },
  summaryList: {
    gap: 8,
    marginTop: 12
  },
  summaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8
  },
  summaryDot: {
    backgroundColor: colors.textMuted,
    borderRadius: 999,
    height: 5,
    marginTop: 9,
    width: 5
  },
  summaryText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20
  },
  resultMeta: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  resultMetaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800'
  },
  sourcesToggle: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sourcesToggleIcon: {
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    width: 22
  },
  sourcesToggleText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16
  },
  sourcesBlock: {
    marginTop: 10,
    width: '100%'
  },
  blockLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  followUpBlock: {
    marginTop: 2,
    width: '100%'
  },
  followUpList: {
    gap: 8
  },
  followUpChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '96%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    ...subtleShadow
  },
  followUpText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  inlinePrompts: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
    height: 54
  },
  inlinePromptsContent: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  inlinePrompt: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.accentSurface,
    borderColor: '#DDD2FE',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    maxWidth: 320,
    minHeight: 36,
    maxHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  inlinePromptText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 17
  },
  composerWrap: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8
  },
  composer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 7,
    ...subtleShadow
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    maxHeight: 130,
    minHeight: 30,
    paddingHorizontal: 0,
    paddingVertical: 2,
    textAlignVertical: 'center'
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.text,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  sendButtonDisabled: {
    opacity: 0.35
  }
});
