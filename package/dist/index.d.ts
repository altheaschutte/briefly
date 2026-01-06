import type { MastraMessageV2, UIMessageWithMetadata } from '@mastra/core/agent';
import { MastraMemory } from '@mastra/core/memory';
import type { MastraMessageV1, MemoryConfig, SharedMemoryConfig, StorageThreadType, WorkingMemoryTemplate } from '@mastra/core/memory';
import type { StorageGetMessagesArg, ThreadSortOptions, PaginationInfo } from '@mastra/core/storage';
import type { ToolAction } from '@mastra/core/tools';
import { embedMany } from 'ai';
import type { CoreMessage } from 'ai';
export type MessageDeleteInput = string[] | {
    id: string;
}[];
/**
 * Concrete implementation of MastraMemory that adds support for thread configuration
 * and message injection.
 */
export declare class Memory extends MastraMemory {
    constructor(config?: SharedMemoryConfig);
    protected validateThreadIsOwnedByResource(threadId: string, resourceId: string, config: MemoryConfig): Promise<void>;
    protected checkStorageFeatureSupport(config: MemoryConfig): void;
    query({ threadId, resourceId, selectBy, threadConfig, }: StorageGetMessagesArg & {
        threadConfig?: MemoryConfig;
    }): Promise<{
        messages: CoreMessage[];
        uiMessages: UIMessageWithMetadata[];
        messagesV2: MastraMessageV2[];
    }>;
    rememberMessages({ threadId, resourceId, vectorMessageSearch, config, }: {
        threadId: string;
        resourceId?: string;
        vectorMessageSearch?: string;
        config?: MemoryConfig;
    }): Promise<{
        messages: MastraMessageV1[];
        messagesV2: MastraMessageV2[];
    }>;
    getThreadById({ threadId }: {
        threadId: string;
    }): Promise<StorageThreadType | null>;
    getThreadsByResourceId({ resourceId, orderBy, sortDirection, }: {
        resourceId: string;
    } & ThreadSortOptions): Promise<StorageThreadType[]>;
    getThreadsByResourceIdPaginated({ resourceId, page, perPage, orderBy, sortDirection, }: {
        resourceId: string;
        page: number;
        perPage: number;
    } & ThreadSortOptions): Promise<PaginationInfo & {
        threads: StorageThreadType[];
    }>;
    private handleWorkingMemoryFromMetadata;
    saveThread({ thread, memoryConfig, }: {
        thread: StorageThreadType;
        memoryConfig?: MemoryConfig;
    }): Promise<StorageThreadType>;
    updateThread({ id, title, metadata, memoryConfig, }: {
        id: string;
        title: string;
        metadata: Record<string, unknown>;
        memoryConfig?: MemoryConfig;
    }): Promise<StorageThreadType>;
    deleteThread(threadId: string): Promise<void>;
    updateWorkingMemory({ threadId, resourceId, workingMemory, memoryConfig, }: {
        threadId: string;
        resourceId?: string;
        workingMemory: string;
        memoryConfig?: MemoryConfig;
    }): Promise<void>;
    private updateWorkingMemoryMutexes;
    /**
     * @warning experimental! can be removed or changed at any time
     */
    __experimental_updateWorkingMemoryVNext({ threadId, resourceId, workingMemory, searchString, memoryConfig, }: {
        threadId: string;
        resourceId?: string;
        workingMemory: string;
        searchString?: string;
        memoryConfig?: MemoryConfig;
    }): Promise<{
        success: boolean;
        reason: string;
    }>;
    protected chunkText(text: string, tokenSize?: number): string[];
    private hasher;
    private embeddingCache;
    private firstEmbed;
    protected embedMessageContent(content: string): Promise<{
        chunks: string[];
        embeddings: Awaited<ReturnType<typeof embedMany>>["embeddings"];
        dimension: number | undefined;
    }>;
    saveMessages(args: {
        messages: (MastraMessageV1 | MastraMessageV2)[] | MastraMessageV1[] | MastraMessageV2[];
        memoryConfig?: MemoryConfig | undefined;
        format?: 'v1';
    }): Promise<MastraMessageV1[]>;
    saveMessages(args: {
        messages: (MastraMessageV1 | MastraMessageV2)[] | MastraMessageV1[] | MastraMessageV2[];
        memoryConfig?: MemoryConfig | undefined;
        format: 'v2';
    }): Promise<MastraMessageV2[]>;
    protected updateMessageToHideWorkingMemory(message: MastraMessageV1): MastraMessageV1 | null;
    protected updateMessageToHideWorkingMemoryV2(message: MastraMessageV2): MastraMessageV2 | null;
    protected parseWorkingMemory(text: string): string | null;
    getWorkingMemory({ threadId, resourceId, memoryConfig, }: {
        threadId: string;
        resourceId?: string;
        memoryConfig?: MemoryConfig;
    }): Promise<string | null>;
    /**
     * Gets the working memory template for the current memory configuration.
     * Supports both ZodObject and JSONSchema7 schemas.
     *
     * @param memoryConfig - The memory configuration containing the working memory settings
     * @returns The working memory template with format and content, or null if working memory is disabled
     */
    getWorkingMemoryTemplate({ memoryConfig, }: {
        memoryConfig?: MemoryConfig;
    }): Promise<WorkingMemoryTemplate | null>;
    getSystemMessage({ threadId, resourceId, memoryConfig, }: {
        threadId: string;
        resourceId?: string;
        memoryConfig?: MemoryConfig;
    }): Promise<string | null>;
    defaultWorkingMemoryTemplate: string;
    protected getWorkingMemoryToolInstruction({ template, data, }: {
        template: WorkingMemoryTemplate;
        data: string | null;
    }): string;
    protected __experimental_getWorkingMemoryToolInstructionVNext({ template, data, }: {
        template: WorkingMemoryTemplate;
        data: string | null;
    }): string;
    private isVNextWorkingMemoryConfig;
    getTools(config?: MemoryConfig): Record<string, ToolAction<any, any, any>>;
    /**
     * Updates the metadata of a list of messages
     * @param messages - The list of messages to update
     * @returns The list of updated messages
     */
    updateMessages({ messages, }: {
        messages: Partial<MastraMessageV2> & {
            id: string;
        }[];
    }): Promise<MastraMessageV2[]>;
    /**
     * Deletes one or more messages
     * @param input - Must be an array containing either:
     *   - Message ID strings
     *   - Message objects with 'id' properties
     * @returns Promise that resolves when all messages are deleted
     */
    deleteMessages(input: MessageDeleteInput): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map