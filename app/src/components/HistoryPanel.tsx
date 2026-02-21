import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Modal,
  SafeAreaView,
  Platform,
} from 'react-native';
import {
  SessionSummary,
  SessionDetail,
  SessionMessage,
  listSessions,
  getSession,
  extractMessageText,
  formatTimestamp,
} from '../services/history';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryPanelProps {
  /** 当历史面板打开/关闭时触发 */
  onToggle?: (open: boolean) => void;
  /** 点击某条历史消息，可将其复制到输入框 */
  onSelectMessage?: (text: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: SessionMessage }) {
  const isUser = msg.message?.role === 'user';
  const text = extractMessageText(msg);
  if (!text && msg.type !== 'summary') return null;

  if (msg.type === 'summary') {
    return (
      <View style={bubbleStyles.summaryRow}>
        <Text style={bubbleStyles.summaryText}>📝 {msg.summary}</Text>
      </View>
    );
  }

  return (
    <View style={[bubbleStyles.row, isUser ? bubbleStyles.userRow : bubbleStyles.assistantRow]}>
      <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.userBubble : bubbleStyles.assistantBubble]}>
        <Text style={[bubbleStyles.role, isUser ? bubbleStyles.userRole : bubbleStyles.assistantRole]}>
          {isUser ? '👤 You' : '🤖 Claude'}
        </Text>
        <Text style={[bubbleStyles.text, isUser ? bubbleStyles.userText : bubbleStyles.assistantText]}>
          {text}
        </Text>
        {msg.timestamp && (
          <Text style={bubbleStyles.time}>{formatTimestamp(msg.timestamp)}</Text>
        )}
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: { marginVertical: 4, paddingHorizontal: 12 },
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start' },
  bubble: { maxWidth: '85%', borderRadius: 12, padding: 10 },
  userBubble: { backgroundColor: '#89b4fa22', borderWidth: 1, borderColor: '#89b4fa44' },
  assistantBubble: { backgroundColor: '#a6e3a111', borderWidth: 1, borderColor: '#a6e3a133' },
  role: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  userRole: { color: '#89b4fa' },
  assistantRole: { color: '#a6e3a1' },
  text: { fontSize: 13, lineHeight: 18 },
  userText: { color: '#cdd6f4' },
  assistantText: { color: '#cdd6f4' },
  time: { fontSize: 9, color: '#6c7086', marginTop: 4, textAlign: 'right' },
  summaryRow: {
    marginVertical: 6,
    marginHorizontal: 12,
    backgroundColor: '#f9e2af18',
    borderLeftWidth: 3,
    borderLeftColor: '#f9e2af',
    borderRadius: 4,
    padding: 8,
  },
  summaryText: { color: '#f9e2af', fontSize: 12 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Session detail modal
// ─────────────────────────────────────────────────────────────────────────────

function SessionDetailModal({
  session,
  onClose,
  onSelectMessage,
}: {
  session: SessionDetail;
  onClose: () => void;
  onSelectMessage?: (text: string) => void;
}) {
  const visibleMessages = session.messages.filter(
    (m) => m.type === 'user' || m.type === 'assistant' || m.type === 'summary',
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={detailStyles.container}>
        {/* Header */}
        <View style={detailStyles.header}>
          <TouchableOpacity onPress={onClose} style={detailStyles.backBtn}>
            <Text style={detailStyles.backText}>←</Text>
          </TouchableOpacity>
          <View style={detailStyles.headerInfo}>
            <Text style={detailStyles.headerTitle} numberOfLines={1}>
              {session.summary}
            </Text>
            <Text style={detailStyles.headerMeta}>
              {session.messageCount} messages · {formatTimestamp(session.lastTimestamp)}
            </Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView style={detailStyles.scroll} contentContainerStyle={detailStyles.scrollContent}>
          {visibleMessages.map((msg, i) => (
            <TouchableOpacity
              key={msg.uuid || i}
              activeOpacity={onSelectMessage ? 0.7 : 1}
              onLongPress={() => {
                const text = extractMessageText(msg);
                if (text && onSelectMessage) onSelectMessage(text);
              }}
            >
              <MessageBubble msg={msg} />
            </TouchableOpacity>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>

        {onSelectMessage && (
          <View style={detailStyles.hint}>
            <Text style={detailStyles.hintText}>长按消息可将其复制到输入框</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#313244',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#313244',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: '#cdd6f4', fontSize: 18 },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#cdd6f4', fontSize: 15, fontWeight: '600' },
  headerMeta: { color: '#6c7086', fontSize: 11, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 8 },
  hint: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#313244',
  },
  hintText: { color: '#45475a', fontSize: 11 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Session list item
// ─────────────────────────────────────────────────────────────────────────────

function SessionItem({
  item,
  onPress,
}: {
  item: SessionSummary;
  onPress: (item: SessionSummary) => void;
}) {
  return (
    <TouchableOpacity style={listStyles.item} onPress={() => onPress(item)} activeOpacity={0.75}>
      <View style={listStyles.itemLeft}>
        <Text style={listStyles.summary} numberOfLines={2}>
          {item.summary}
        </Text>
        <Text style={listStyles.meta} numberOfLines={1}>
          {item.projectPath.split('/').pop()} · {item.messageCount} msg
        </Text>
      </View>
      <View style={listStyles.itemRight}>
        <Text style={listStyles.time}>{formatTimestamp(item.lastTimestamp)}</Text>
        <Text style={listStyles.arrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const listStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#313244',
    gap: 8,
  },
  itemLeft: { flex: 1 },
  summary: { color: '#cdd6f4', fontSize: 13, lineHeight: 18 },
  meta: { color: '#6c7086', fontSize: 11, marginTop: 3 },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  time: { color: '#45475a', fontSize: 10 },
  arrow: { color: '#6c7086', fontSize: 18 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main HistoryPanel
// ─────────────────────────────────────────────────────────────────────────────

export function HistoryPanel({ onToggle, onSelectMessage }: HistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const toggle = useCallback(() => {
    const next = !isOpen;
    setIsOpen(next);
    onToggle?.(next);
    if (next && sessions.length === 0) {
      fetchSessions();
    }
  }, [isOpen, sessions.length, onToggle]);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listSessions();
      setSessions(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleItemPress = useCallback(async (item: SessionSummary) => {
    setLoadingDetail(true);
    try {
      const detail = await getSession(item.sessionId, item.projectPath);
      setSelectedSession(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSelectMessage = useCallback(
    (text: string) => {
      setSelectedSession(null);
      setIsOpen(false);
      onSelectMessage?.(text);
    },
    [onSelectMessage],
  );

  return (
    <>
      {/* 触发按钮 */}
      <TouchableOpacity style={panelStyles.trigger} onPress={toggle} activeOpacity={0.8}>
        <Text style={panelStyles.triggerIcon}>🕐</Text>
        <Text style={panelStyles.triggerLabel}>历史</Text>
      </TouchableOpacity>

      {/* 历史面板（下滑抽屉） */}
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={toggle}
      >
        <SafeAreaView style={panelStyles.container}>
          {/* 面板 Header */}
          <View style={panelStyles.header}>
            <Text style={panelStyles.headerTitle}>📖 历史会话</Text>
            <View style={panelStyles.headerActions}>
              <TouchableOpacity
                onPress={fetchSessions}
                style={panelStyles.refreshBtn}
                disabled={loading}
              >
                <Text style={panelStyles.refreshText}>{loading ? '…' : '↻'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={toggle} style={panelStyles.closeBtn}>
                <Text style={panelStyles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 错误提示 */}
          {error && (
            <View style={panelStyles.errorBanner}>
              <Text style={panelStyles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {/* 加载中 */}
          {loading && (
            <View style={panelStyles.center}>
              <ActivityIndicator color="#89b4fa" size="large" />
              <Text style={panelStyles.loadingText}>正在读取历史记录…</Text>
            </View>
          )}

          {/* 加载详情中 */}
          {loadingDetail && (
            <View style={panelStyles.detailLoading}>
              <ActivityIndicator color="#89b4fa" size="small" />
              <Text style={panelStyles.loadingText}>正在加载会话…</Text>
            </View>
          )}

          {/* 列表 */}
          {!loading && (
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.sessionId}
              renderItem={({ item }) => (
                <SessionItem item={item} onPress={handleItemPress} />
              )}
              ListEmptyComponent={
                !error ? (
                  <View style={panelStyles.empty}>
                    <Text style={panelStyles.emptyIcon}>📭</Text>
                    <Text style={panelStyles.emptyText}>没有找到历史会话</Text>
                    <Text style={panelStyles.emptyHint}>
                      确保 Runner 在线且运行在安装了 Claude Code 的机器上
                    </Text>
                  </View>
                ) : null
              }
              contentContainerStyle={sessions.length === 0 ? { flex: 1 } : undefined}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* 会话详情 Modal */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onSelectMessage={onSelectMessage ? handleSelectMessage : undefined}
        />
      )}
    </>
  );
}

const panelStyles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#313244',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  triggerIcon: { fontSize: 14 },
  triggerLabel: { color: '#cdd6f4', fontSize: 13, fontWeight: '500' },
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#313244',
  },
  headerTitle: { color: '#cdd6f4', fontSize: 17, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 8 },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#313244',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: { color: '#89b4fa', fontSize: 18 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#313244',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#cdd6f4', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  detailLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  loadingText: { color: '#a6adc8', fontSize: 13 },
  errorBanner: {
    backgroundColor: '#f38ba822',
    borderLeftWidth: 3,
    borderLeftColor: '#f38ba8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    margin: 12,
    borderRadius: 6,
  },
  errorText: { color: '#f38ba8', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyIcon: { fontSize: 40 },
  emptyText: { color: '#cdd6f4', fontSize: 16, fontWeight: '500' },
  emptyHint: { color: '#6c7086', fontSize: 12, textAlign: 'center' },
});
