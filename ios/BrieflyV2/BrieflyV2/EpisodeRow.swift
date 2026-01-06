import SwiftUI

struct EpisodeRow: View {
    let episode: Episode
    var namespace: Namespace.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(episode.displayDateLabel)
                        .font(.caption.weight(.medium))
                        .foregroundColor(.brieflyTextMuted)
                    Text(episode.displayTitle)
                        .font(.callout.weight(.semibold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                    Text(episode.subtitle)
                        .font(.footnote)
                        .foregroundColor(.brieflyTextMuted)
                        .lineLimit(2)
                }
                Spacer(minLength: 8)
                coverImageView
            }

            EpisodePlaybackRow(episode: episode)
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var coverImageView: some View {
        let size: CGFloat = 72
        return Group {
            if let url = episode.coverImageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .empty:
                        placeholder
                    case .failure:
                        placeholder
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .applyMatchedSource(id: "EPISODE-\(episode.id)", namespace: namespace)
    }

    private var placeholder: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.brieflySurface)
            Image(systemName: "waveform")
                .foregroundColor(.brieflyTextMuted)
        }
    }
}

private extension View {
    @ViewBuilder
    func applyMatchedSource(id: String, namespace: Namespace.ID?) -> some View {
        if let namespace {
            self.matchedTransitionSource(id: id, in: namespace)
        } else {
            self
        }
    }
}
