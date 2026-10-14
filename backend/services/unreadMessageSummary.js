export function buildUnreadMessagesPipeline(userId) {
  return [
    {
      $match: {
        receiverId: userId,
        read: false,
        hiddenFor: { $ne: userId },
      },
    },
    {
      $facet: {
        counts: [{ $group: { _id: '$senderId', count: { $sum: 1 } } }],
        recent: [
          { $sort: { createdAt: -1 } },
          { $limit: 10 },
          {
            $project: {
              senderId: 1,
              receiverId: 1,
              text: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
  ]
}

export function summarizeUnreadMessages(aggregateResult = {}) {
  const counts = {}
  for (const entry of aggregateResult.counts || []) {
    counts[entry._id] = entry.count
  }

  return {
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    recent: aggregateResult.recent || [],
  }
}
